import type {
  BoiteDeReception,
  DepositaireDeBrouillon,
  Horloge,
  LotDeCourriels,
} from '@mailhelper/application';
import { err, heuresAvant, motifDeNonReponse, ok, type Result } from '@mailhelper/domain';
import { cleDeTraitement, etatInitial, type Traitement } from '@relaismetier/domain';

import type { JournalDesTraitements } from './ports.js';

/** Une boîte partagée de l'entreprise, avec ses trois accès (contrats tenus par mailHelper). */
export interface BoiteGeree {
  readonly id: string;
  readonly adresse: string;
  /** Nombre maximal de courriels traités en même temps lors du tri (phase 3b). */
  readonly parallelisme: number;
  readonly reception: BoiteDeReception;
  readonly envoyes: BoiteDeReception;
  readonly depositaire: DepositaireDeBrouillon;
}

export interface DescriptionDeBoite {
  readonly id: string;
  readonly adresse: string;
}

export type ProblemeDeConnexion =
  { readonly kind: 'boite-inconnue' } | { readonly kind: 'boite-injoignable' };

export interface ConnexionVerifiee {
  /** Courriels reçus dans les dernières 24 heures, au plus LIMITE_DE_VERIFICATION. */
  readonly courrielsRecents: number;
}

/** Ce qu'un relevé a fait, pour que l'exécution reste lisible dans n8n. */
export interface CompteRenduDeReleve {
  /** Courriels lus dans la fenêtre de relevé, y compris ceux déjà connus. */
  readonly lus: number;
  /** Courriels inscrits par ce relevé (les autres l'avaient déjà été). */
  readonly nouveaux: number;
  readonly dejaConnus: number;
  /** Parmi les nouveaux : écartés par une règle de mailHelper, sans passer par le modèle. */
  readonly sansReponse: number;
  /** Parmi les nouveaux : en attente du tri. */
  readonly aTrier: number;
  /** Messages reçus mais inexploitables (expéditeur illisible…) : comptés, jamais cachés. */
  readonly illisibles: number;
}

export interface CasDUsageDesBoites {
  listerLesBoites(): readonly DescriptionDeBoite[];
  verifierLaConnexion(id: string): Promise<Result<ConnexionVerifiee, ProblemeDeConnexion>>;
  /**
   * Relève les courriels récents d'une boîte et inscrit les nouveaux au journal. Rejouable sans
   * effet : un courriel déjà inscrit est seulement compté comme connu.
   */
  relever(id: string): Promise<Result<CompteRenduDeReleve, ProblemeDeConnexion>>;
}

export interface DependancesDesBoites {
  readonly boites: readonly BoiteGeree[];
  readonly journal: JournalDesTraitements;
  readonly horloge: Horloge;
  /** Reçoit la cause d'une boîte injoignable, qui n'est jamais renvoyée à l'appelant. */
  readonly signalerUnePanne: (erreur: unknown) => void;
}

/** Lecture volontairement légère : la vérification ne doit pas télécharger toute la boîte. */
export const LIMITE_DE_VERIFICATION = 10;

/**
 * Fenêtre relue à chaque relevé. Bien plus longue que l'intervalle entre deux relevés (quelques
 * minutes) : un service arrêté un week-end rattrape son retard, et le journal écarte les doublons.
 */
export const FENETRE_DE_RELEVE_EN_HEURES = 72;
export const LIMITE_DE_RELEVE = 200;

export function creerLesCasDUsageDesBoites({
  boites,
  journal,
  horloge,
  signalerUnePanne,
}: DependancesDesBoites): CasDUsageDesBoites {
  const parId = new Map(boites.map((boite) => [boite.id, boite]));

  /** Lit la boîte ; une panne de messagerie devient un problème attendu, pas une exception. */
  async function lire(
    id: string,
    heures: number,
    limite: number,
  ): Promise<Result<{ boite: BoiteGeree; lot: LotDeCourriels }, ProblemeDeConnexion>> {
    const boite = parId.get(id);
    if (boite === undefined) return err({ kind: 'boite-inconnue' });
    try {
      const lot = await boite.reception.listerLesRecents({
        depuis: heuresAvant(horloge.maintenant(), heures),
        limite,
      });
      return ok({ boite, lot });
    } catch (erreur) {
      // Identifiants refusés, serveur injoignable… : un problème attendu, pas un bug.
      signalerUnePanne(erreur);
      return err({ kind: 'boite-injoignable' });
    }
  }

  return {
    listerLesBoites: () => boites.map(({ id, adresse }) => ({ id, adresse })),

    async verifierLaConnexion(id) {
      const lu = await lire(id, 24, LIMITE_DE_VERIFICATION);
      return lu.ok ? ok({ courrielsRecents: lu.value.lot.courriels.length }) : lu;
    },

    async relever(id) {
      const lu = await lire(id, FENETRE_DE_RELEVE_EN_HEURES, LIMITE_DE_RELEVE);
      if (!lu.ok) return lu;
      const { boite, lot } = lu.value;

      const traitements: Traitement[] = lot.courriels.map((courriel) => ({
        cle: cleDeTraitement(boite.id, courriel.id),
        boite: boite.id,
        idCourriel: courriel.id,
        recuLe: courriel.recuLe,
        // Les règles déterministes de mailHelper tranchent d'abord, et l'emportent sur le modèle.
        etat: etatInitial(motifDeNonReponse(courriel)),
      }));
      // Une panne de la base n'est pas une panne de messagerie : elle remonte telle quelle.
      const inscrites = await journal.inscrireLesNouveaux(traitements);
      const nouveaux = traitements.filter(({ cle }) => inscrites.has(cle));

      return ok({
        lus: traitements.length,
        nouveaux: nouveaux.length,
        dejaConnus: traitements.length - nouveaux.length,
        sansReponse: nouveaux.filter(({ etat }) => etat.kind === 'sans-reponse').length,
        aTrier: nouveaux.filter(({ etat }) => etat.kind === 'a-trier').length,
        illisibles: lot.illisibles,
      });
    },
  };
}
