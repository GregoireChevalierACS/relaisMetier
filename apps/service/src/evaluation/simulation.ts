import type { CasDEvaluation } from '@relaismetier/jeu-synthetique';

import type { ParametresDuModele } from '../llm/modelesClaude.js';
import type { EnvoyerEtMesurer } from './banc.js';

/**
 * Réponses simulées, pour vérifier tout le banc (règles, notation, coûts, rapport) sans un seul
 * appel payant : l'oracle répond les attendus (≈ 100 % attendu), le nul ne voit jamais de
 * réponse à faire (le score tombe à la part des courriels sans réponse).
 */
export type Simulation = 'oracle' | 'nul';

/** Usage fictif mais non nul : un coût à zéro dans un rapport trahirait un champ mal relu. */
const USAGE_SIMULE = {
  input_tokens: 500,
  output_tokens: 100,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

export function envoiSimule(
  cas: CasDEvaluation,
  simulation: Simulation,
  modeleDeTri: string,
): EnvoyerEtMesurer {
  return (parametres: ParametresDuModele) => {
    const reponse =
      parametres.model === modeleDeTri
        ? {
            reponseAttendue: simulation === 'oracle' && cas.attendu.reponseAttendue,
            motif: `Simulation ${simulation}.`,
          }
        : { texte: 'Bonjour,\n\nNous revenons vers vous très vite.' };
    return Promise.resolve({
      model: parametres.model,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(reponse) }],
      usage: USAGE_SIMULE,
    });
  };
}
