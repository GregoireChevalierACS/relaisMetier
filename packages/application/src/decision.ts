import { motifDeNonReponse, type Courriel } from '@mailhelper/domain';

import { schemaDeTri } from './schemasDuModele.js';

/** Ce que le tri conclut d'un courriel, une fois la réponse du modèle confrontée aux règles. */
export type DecisionDuTri =
  | { readonly kind: 'reponse-invalide' }
  | { readonly kind: 'sans-reponse'; readonly motif: string; readonly par: 'regle' | 'modele' }
  | { readonly kind: 'reponse-attendue'; readonly motif: string };

/**
 * La décision du tri, la même en production et dans l'évaluation : la réponse du modèle est
 * validée, puis les règles de mailHelper l'emportent toujours sur elle.
 */
export function deciderDuTri(courriel: Courriel, reponseDuModele: unknown): DecisionDuTri {
  const tri = schemaDeTri.safeParse(reponseDuModele);
  if (!tri.success) return { kind: 'reponse-invalide' };
  const motifImpose = motifDeNonReponse(courriel);
  if (motifImpose !== null) return { kind: 'sans-reponse', motif: motifImpose, par: 'regle' };
  return tri.data.reponseAttendue
    ? { kind: 'reponse-attendue', motif: tri.data.motif }
    : { kind: 'sans-reponse', motif: tri.data.motif, par: 'modele' };
}
