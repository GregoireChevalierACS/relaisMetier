import type { Horloge } from '@mailhelper/application';
import {
  err,
  heuresAvant,
  motifDeNonReponse,
  ok,
  preparerLeBrouillon,
  type Courriel,
  type Result,
} from '@mailhelper/domain';
import {
  apresUnEchec,
  tentativesDe,
  type EtatDeTraitement,
  type Traitement,
} from '@relaismetier/domain';

import {
  FENETRE_DE_RELEVE_EN_HEURES,
  LIMITE_DE_RELEVE,
  type BoiteGeree,
  type ProblemeDeConnexion,
} from './boites.js';
import type { JournalDesTraitements, Redacteur, Trieur } from './ports.js';
import { schemaDeRedaction, schemaDeTri } from './schemasDuModele.js';

/** Les deux modèles : un petit pour trier, un plus grand pour rédiger. */
export interface Modeles {
  readonly trieur: Trieur;
  readonly redacteur: Redacteur;
}

export interface DependancesDuTri {
  readonly boites: readonly BoiteGeree[];
  readonly journal: JournalDesTraitements;
  readonly horloge: Horloge;
  /** null : aucune clé d'API configurée, le tri est désactivé (et rien n'est consommé). */
  readonly modeles: Modeles | null;
  /** Reçoit la cause des échecs, qui n'est jamais renvoyée à l'appelant. */
  readonly signalerUnePanne: (erreur: unknown) => void;
}

/** Ce qu'un tri a fait, pour que l'exécution reste lisible dans n8n. */
export interface CompteRenduDeTri {
  /** Vrai quand aucun modèle n'est configuré : le tri n'a rien fait. */
  readonly desactive: boolean;
  readonly traites: number;
  readonly sansReponse: number;
  readonly brouillons: number;
  /** Échecs qui seront retentés au prochain tri. */
  readonly aRetenter: number;
  /** Échecs de trop : mis de côté pour un humain. */
  readonly misDeCote: number;
}

export interface CasDUsageDuTri {
  /**
   * Trie les courriels réservés d'une boîte : le modèle décide si une réponse est attendue, puis
   * en rédige le corps ; le brouillon est déposé dans la boîte. Rien n'est jamais envoyé.
   */
  trier(id: string): Promise<Result<CompteRenduDeTri, ProblemeDeConnexion>>;
}

/** Courriels traités par appel : un tri reste court, le suivant prend la suite. */
export const LIMITE_DE_TRI = 20;
/** Au-delà, un tri interrompu (service arrêté) rend ses courriels aux tris suivants. */
export const DUREE_DE_RESERVATION_EN_MILLISECONDES = 15 * 60_000;

const RIEN: CompteRenduDeTri = {
  desactive: false,
  traites: 0,
  sansReponse: 0,
  brouillons: 0,
  aRetenter: 0,
  misDeCote: 0,
};

/** Traite les éléments avec au plus `limite` traitements simultanés, dans l'ordre. */
async function enParallele<T, R>(
  elements: readonly T[],
  limite: number,
  traiter: (element: T) => Promise<R>,
): Promise<R[]> {
  const resultats: R[] = [];
  const file = elements.map((element, index) => ({ element, index }));
  async function ouvrier(): Promise<void> {
    for (let suivant = file.shift(); suivant !== undefined; suivant = file.shift()) {
      resultats[suivant.index] = await traiter(suivant.element);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, elements.length) }, ouvrier));
  return resultats;
}

export function creerLeTri({
  boites,
  journal,
  horloge,
  modeles,
  signalerUnePanne,
}: DependancesDuTri): CasDUsageDuTri {
  const parId = new Map(boites.map((boite) => [boite.id, boite]));

  /** L'issue du tri d'un courriel. Les échecs consomment une tentative, jamais plus. */
  async function traiter(
    { trieur, redacteur }: Modeles,
    boite: BoiteGeree,
    traitement: Traitement,
    courriel: Courriel | undefined,
  ): Promise<EtatDeTraitement> {
    const tentatives = tentativesDe(traitement.etat);
    if (courriel === undefined)
      return apresUnEchec(tentatives, 'courriel introuvable dans la boîte');

    let etape = 'tri';
    try {
      const tri = schemaDeTri.safeParse(await trieur.trier(courriel));
      if (!tri.success) return apresUnEchec(tentatives, 'réponse du tri invalide');

      // Les règles de mailHelper l'emportent toujours sur le modèle.
      const motifImpose = motifDeNonReponse(courriel);
      if (motifImpose !== null) return { kind: 'sans-reponse', motif: motifImpose, par: 'regle' };
      if (!tri.data.reponseAttendue) {
        return { kind: 'sans-reponse', motif: tri.data.motif, par: 'modele' };
      }

      etape = 'rédaction';
      const redaction = schemaDeRedaction.safeParse(await redacteur.rediger(courriel));
      if (!redaction.success) return apresUnEchec(tentatives, 'réponse de la rédaction invalide');
      // Le destinataire et l'objet viennent du courriel, jamais du modèle (mailHelper).
      const brouillon = preparerLeBrouillon(courriel, redaction.data.texte);
      // Texte vide : l'adresse sans lecteur, elle, a déjà été écartée par les règles ci-dessus.
      if (!brouillon.ok)
        return apresUnEchec(tentatives, `brouillon impossible : ${brouillon.error.kind}`);

      etape = 'dépôt du brouillon';
      await boite.depositaire.deposer({ brouillon: brouillon.value, piecesJointes: [] });
      return { kind: 'brouillon-depose', motif: tri.data.motif };
    } catch (erreur) {
      // Modèle indisponible, refus, boîte injoignable… : retenté au prochain tri.
      signalerUnePanne(erreur);
      return apresUnEchec(tentatives, `échec : ${etape}`);
    }
  }

  return {
    async trier(id) {
      const boite = parId.get(id);
      if (boite === undefined) return err({ kind: 'boite-inconnue' });
      if (modeles === null) return ok({ ...RIEN, desactive: true });

      const maintenant = horloge.maintenant();
      const reserves = await journal.reserverLesATrier({
        boite: boite.id,
        limite: LIMITE_DE_TRI,
        maintenant,
        dureeEnMillisecondes: DUREE_DE_RESERVATION_EN_MILLISECONDES,
      });
      if (reserves.length === 0) return ok(RIEN);

      let courriels: ReadonlyMap<string, Courriel>;
      try {
        const lot = await boite.reception.listerLesRecents({
          depuis: heuresAvant(maintenant, FENETRE_DE_RELEVE_EN_HEURES),
          limite: LIMITE_DE_RELEVE,
        });
        courriels = new Map(lot.courriels.map((courriel) => [courriel.id, courriel]));
      } catch (erreur) {
        // La boîte est injoignable : les courriels sont rendus sans consommer de tentative.
        signalerUnePanne(erreur);
        for (const { cle, etat } of reserves) await journal.terminer(cle, etat);
        return err({ kind: 'boite-injoignable' });
      }

      const etats = await enParallele(reserves, boite.parallelisme, async (traitement) => {
        const etat = await traiter(
          modeles,
          boite,
          traitement,
          courriels.get(traitement.idCourriel),
        );
        await journal.terminer(traitement.cle, etat);
        return etat;
      });
      const compter = (kind: EtatDeTraitement['kind']) =>
        etats.filter((etat) => etat.kind === kind).length;
      return ok({
        desactive: false,
        traites: etats.length,
        sansReponse: compter('sans-reponse'),
        brouillons: compter('brouillon-depose'),
        aRetenter: compter('a-trier'),
        misDeCote: compter('mis-de-cote'),
      });
    },
  };
}
