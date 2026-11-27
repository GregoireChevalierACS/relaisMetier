import { creerCourriel, type Courriel } from '@mailhelper/domain';
import { estUneDiffusionDeMasse } from '@mailhelper/messagerie';
import type { CasDEvaluation } from '@relaismetier/jeu-synthetique';

/**
 * Le courriel qu'un relevé aurait lu pour ce cas : la diffusion de masse est déduite des en-têtes
 * par mailHelper, exactement comme le fait l'adapter IMAP.
 */
export function versLeCourriel(cas: CasDEvaluation): Courriel {
  const courriel = creerCourriel({
    id: cas.messageId,
    expediteur: cas.de,
    repondreA: cas.repondreA,
    objet: cas.objet,
    corps: cas.corps,
    recuLe: cas.envoyeLe,
    diffusionDeMasse: estUneDiffusionDeMasse(cas.entetes.map(([name, value]) => ({ name, value }))),
  });
  // Les cas viennent de notre générateur : un courriel invalide y est un bug, pas un cas à noter.
  if (!courriel.ok)
    throw new Error(`cas d'évaluation invalide ${cas.messageId} : ${courriel.error.kind}`);
  return courriel.value;
}
