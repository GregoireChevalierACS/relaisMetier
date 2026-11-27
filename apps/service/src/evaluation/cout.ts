// Coût d'un appel, calculé à partir du modèle et de l'usage renvoyés par l'API (jamais de la
// configuration : un repli sur un autre modèle doit se voir dans le coût).

/** Prix publics en dollars par million de jetons (prompts de moins de 100 000 jetons). */
export const PRIX_PAR_MILLION: Readonly<
  Record<
    string,
    { readonly entree: number; readonly sortie: number; readonly lectureDeCache: number }
  >
> = {
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5, lectureDeCache: 0.01 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10, lectureDeCache: 0.1 },
};

/** Écriture en cache (durée de vie de 5 minutes) : 1,25 fois le prix d'entrée. */
const MAJORATION_D_ECRITURE_EN_CACHE = 1.25;

export interface Usage {
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_input_tokens: number;
  readonly cache_creation_input_tokens: number;
}

export const USAGE_NUL: Usage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

export const additionner = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
});

/** Coût en dollars, ou null pour un modèle dont le prix n'est pas connu ici (à signaler). */
export function coutEnDollars(modele: string, usage: Usage): number | null {
  const prix = PRIX_PAR_MILLION[modele];
  if (prix === undefined) return null;
  return (
    (usage.input_tokens * prix.entree +
      usage.cache_creation_input_tokens * prix.entree * MAJORATION_D_ECRITURE_EN_CACHE +
      usage.cache_read_input_tokens * prix.lectureDeCache +
      usage.output_tokens * prix.sortie) /
    1_000_000
  );
}
