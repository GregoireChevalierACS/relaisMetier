import { createHash } from 'node:crypto';

import { creerAlea } from './alea.js';
import { genererLesCourriels, type AttenduDeCourriel } from './courriels.js';
import { JOUR_DE_REFERENCE } from './dates.js';
import { messageId, versEml } from './eml.js';
import { BOITES, ENTREPRISE, type Boite } from './entreprise.js';
import { instantDEnvoi, messageIdDEnvoi, versEmlDEnvoi } from './envoyes.js';
import { exporterLesContrats, exporterLesDevisSignes, ONGLETS } from './excel.js';
import { genererLeModele, type ContratDEntretien, type Devis, type DevisSigne } from './modele.js';
import { genererLeDevisPdf } from './pdf.js';

export const GRAINE_PAR_DEFAUT = 42;

export const FICHIER_DU_MANIFESTE = 'attendus.json';

export const CHEMINS = {
  courriel: (boite: Boite, numero: number): string =>
    `courriels/${boite}/${String(numero).padStart(3, '0')}.eml`,
  devis: (numero: string): string => `devis/${numero}.pdf`,
  variante: (numero: string): string => `devis/variantes/${numero}--mise-en-page-modifiee.pdf`,
  envoi: (numero: string): string => `envoyes/devis/${numero}.eml`,
  devisSignes: 'exports/devis-signes.xlsx',
  contrats: 'exports/contrats-entretien.xlsx',
} as const;

export interface CourrielAttendu {
  readonly fichier: string;
  readonly boite: Boite;
  readonly messageId: string;
  readonly objet: string;
  readonly attendu: AttenduDeCourriel;
}

/** Un message du dossier « Envoyés » : l'envoi d'un devis à son client, PDF joint. */
export interface EnvoiAttendu {
  readonly fichier: string;
  readonly boite: Boite;
  readonly messageId: string;
  readonly devis: string;
  readonly destinataire: string;
  /** Instant d'envoi, ISO 8601 UTC. */
  readonly envoyeLe: string;
}

/** Un devis PDF et ce que sa lecture doit donner : ses champs, ou un refus de la mise en page. */
export type DevisAttendu =
  | { readonly fichier: string; readonly miseEnPage: 'reference'; readonly attendu: Devis }
  | {
      readonly fichier: string;
      readonly miseEnPage: 'variante';
      readonly numero: string;
      readonly attendu: { readonly refus: 'mise-en-page-inconnue' };
    };

export interface Manifeste {
  readonly graine: number;
  readonly mention: string;
  /** Jour où le jeu est relevé : tous ses faits lui sont antérieurs. */
  readonly jourDeReference: string;
  readonly boites: typeof BOITES;
  readonly courriels: readonly CourrielAttendu[];
  readonly envoyes: readonly EnvoiAttendu[];
  readonly devis: readonly DevisAttendu[];
  readonly exports: {
    readonly devisSignes: {
      readonly fichier: string;
      readonly onglets: { readonly devis: string; readonly lignes: string };
      readonly attendu: readonly DevisSigne[];
    };
    readonly contrats: {
      readonly fichier: string;
      readonly onglet: string;
      readonly attendu: readonly ContratDEntretien[];
    };
  };
  /** Empreinte SHA-256 de chaque fichier généré, manifeste exclu. */
  readonly empreintes: Readonly<Record<string, string>>;
}

export interface FichierGenere {
  readonly chemin: string;
  readonly contenu: Buffer;
}

export interface Jeu {
  readonly fichiers: readonly FichierGenere[];
  readonly manifeste: Manifeste;
}

const empreinte = (contenu: Buffer): string => createHash('sha256').update(contenu).digest('hex');

/** Génère tout le jeu en mémoire. Même graine, mêmes octets, manifeste compris. */
export async function genererLeJeu(graine: number): Promise<Jeu> {
  const alea = creerAlea(graine);
  const modele = genererLeModele(alea);
  const courriels = genererLesCourriels(alea, modele);
  // Le premier devis (remplacement de chaudière) existe aussi dans la mise en page modifiée.
  const devisEnVariante = modele.devis.slice(0, 1);

  const fichiers: FichierGenere[] = courriels.map((courriel) => ({
    chemin: CHEMINS.courriel(courriel.boite, courriel.numero),
    contenu: versEml(graine, courriel),
  }));
  for (const devis of modele.devis) {
    const pdf = await genererLeDevisPdf(devis, 'reference');
    fichiers.push(
      { chemin: CHEMINS.devis(devis.numero), contenu: pdf },
      { chemin: CHEMINS.envoi(devis.numero), contenu: versEmlDEnvoi(graine, devis, pdf) },
    );
  }
  for (const devis of devisEnVariante) {
    fichiers.push({
      chemin: CHEMINS.variante(devis.numero),
      contenu: await genererLeDevisPdf(devis, 'variante'),
    });
  }
  fichiers.push(
    { chemin: CHEMINS.devisSignes, contenu: await exporterLesDevisSignes(modele) },
    { chemin: CHEMINS.contrats, contenu: await exporterLesContrats(modele) },
  );

  const manifeste: Manifeste = {
    graine,
    mention: ENTREPRISE.mention,
    jourDeReference: JOUR_DE_REFERENCE,
    boites: BOITES,
    courriels: courriels.map((courriel) => ({
      fichier: CHEMINS.courriel(courriel.boite, courriel.numero),
      boite: courriel.boite,
      messageId: messageId(graine, courriel),
      objet: courriel.objet,
      attendu: courriel.attendu,
    })),
    envoyes: modele.devis.map((devis) => ({
      fichier: CHEMINS.envoi(devis.numero),
      boite: 'devis',
      messageId: messageIdDEnvoi(graine, devis.numero),
      devis: devis.numero,
      destinataire: devis.client.courriel,
      envoyeLe: new Date(instantDEnvoi(devis)).toISOString(),
    })),
    devis: [
      ...modele.devis.map((devis): DevisAttendu => ({
        fichier: CHEMINS.devis(devis.numero),
        miseEnPage: 'reference',
        attendu: devis,
      })),
      ...devisEnVariante.map((devis): DevisAttendu => ({
        fichier: CHEMINS.variante(devis.numero),
        miseEnPage: 'variante',
        numero: devis.numero,
        attendu: { refus: 'mise-en-page-inconnue' },
      })),
    ],
    exports: {
      devisSignes: {
        fichier: CHEMINS.devisSignes,
        onglets: { devis: ONGLETS.devisSignes, lignes: ONGLETS.lignes },
        attendu: modele.devisSignes,
      },
      contrats: { fichier: CHEMINS.contrats, onglet: ONGLETS.contrats, attendu: modele.contrats },
    },
    empreintes: Object.fromEntries(
      fichiers.map(({ chemin, contenu }) => [chemin, empreinte(contenu)]),
    ),
  };

  return {
    fichiers: [
      ...fichiers,
      {
        chemin: FICHIER_DU_MANIFESTE,
        contenu: Buffer.from(`${JSON.stringify(manifeste, null, 2)}\n`),
      },
    ],
    manifeste,
  };
}
