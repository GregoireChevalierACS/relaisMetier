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

/**
 * Où en est un courriel. Les règles déterministes tranchent d'abord : ce qu'elles écartent ne
 * passera jamais par le modèle de langage. Le reste attend le tri.
 */
export type EtatDeTraitement =
  | { readonly kind: 'a-trier' }
  | { readonly kind: 'sans-reponse'; readonly motif: string; readonly par: 'regle' };

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
    ? { kind: 'a-trier' }
    : { kind: 'sans-reponse', motif: motifDeNonReponse, par: 'regle' };
}
