// Le traitement d'un courriel reçu : chaque courriel relevé est inscrit une fois, avec une clé qui
// vient des faits (la boîte et l'identifiant attribué par le serveur), jamais de l'horloge.

/** « devis/1795599810:42 » : la boîte, puis l'identifiant du courriel dans cette boîte. */
export type CleDeTraitement = string;

/**
 * Clé d'idempotence d'un courriel. L'identifiant IMAP (UIDVALIDITY:UID) est unique dans une boîte,
 * pas d'une boîte à l'autre : la boîte fait partie de la clé.
 */
export const cleDeTraitement = (boite: string, idCourriel: string): CleDeTraitement =>
  `${boite}/${idCourriel}`;

/** Au-delà, un courriel n'est plus retenté : il est mis de côté et signalé. */
export const TENTATIVES_MAXIMALES = 3;

/**
 * Où en est un courriel. Les règles déterministes tranchent d'abord : ce qu'elles écartent ne
 * passe jamais par le modèle de langage. Le reste attend le tri, puis reçoit un brouillon ou
 * non ; après trop d'échecs, il est mis de côté pour un humain.
 */
export type EtatDeTraitement =
  | { readonly kind: 'a-trier'; readonly tentatives: number }
  | { readonly kind: 'sans-reponse'; readonly motif: string; readonly par: 'regle' | 'modele' }
  | { readonly kind: 'brouillon-depose'; readonly motif: string }
  | { readonly kind: 'mis-de-cote'; readonly cause: string; readonly tentatives: number };

export interface Traitement {
  readonly cle: CleDeTraitement;
  readonly boite: string;
  readonly idCourriel: string;
  readonly recuLe: number;
  readonly etat: EtatDeTraitement;
}

/** État d'un courriel à son inscription, d'après le motif de non-réponse des règles (ou null). */
export function etatInitial(motifDeNonReponse: string | null): EtatDeTraitement {
  return motifDeNonReponse === null
    ? { kind: 'a-trier', tentatives: 0 }
    : { kind: 'sans-reponse', motif: motifDeNonReponse, par: 'regle' };
}

/**
 * État après un échec du tri, de la rédaction ou du dépôt : le courriel sera retenté, sauf s'il a
 * épuisé ses tentatives (reprises bornées, puis mise de côté).
 */
export function apresUnEchec(tentativesPrecedentes: number, cause: string): EtatDeTraitement {
  const tentatives = tentativesPrecedentes + 1;
  return tentatives >= TENTATIVES_MAXIMALES
    ? { kind: 'mis-de-cote', cause, tentatives }
    : { kind: 'a-trier', tentatives };
}

/** Tentatives déjà consommées : celles d'un courriel à trier ou mis de côté, aucune sinon. */
export function tentativesDe(etat: EtatDeTraitement): number {
  switch (etat.kind) {
    case 'a-trier':
    case 'mis-de-cote':
      return etat.tentatives;
    case 'sans-reponse':
    case 'brouillon-depose':
      return 0;
  }
}
