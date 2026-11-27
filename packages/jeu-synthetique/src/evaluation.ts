import { creerAlea } from './alea.js';
import { genererLesCourriels, type Adresse, type AttenduDeCourriel } from './courriels.js';
import { messageId } from './eml.js';
import type { Boite } from './entreprise.js';
import { genererLeModele } from './modele.js';

/**
 * Un cas du jeu d'évaluation : le courriel tel qu'il est reçu (en-têtes compris) et ce qu'un tri
 * correct doit en conclure. Les mêmes 50 courriels que les fichiers .eml du jeu, pour la même
 * graine.
 */
export interface CasDEvaluation {
  readonly messageId: string;
  readonly boite: Boite;
  readonly de: Adresse;
  readonly repondreA: Adresse | null;
  readonly objet: string;
  readonly corps: string;
  /** Instant de réception, en millisecondes UTC. */
  readonly envoyeLe: number;
  /** En-têtes supplémentaires (List-Unsubscribe, Precedence, Auto-Submitted…). */
  readonly entetes: readonly (readonly [string, string])[];
  readonly attendu: AttenduDeCourriel;
}

/** Les cas d'évaluation, tirés exactement comme dans genererLeJeu. */
export function genererLesCasDEvaluation(graine: number): CasDEvaluation[] {
  const alea = creerAlea(graine);
  const modele = genererLeModele(alea);
  return genererLesCourriels(alea, modele).map((courriel) => ({
    messageId: messageId(graine, courriel),
    boite: courriel.boite,
    de: courriel.de,
    repondreA: courriel.repondreA,
    objet: courriel.objet,
    corps: courriel.corps,
    envoyeLe: courriel.envoyeLe,
    entetes: courriel.entetes,
    attendu: courriel.attendu,
  }));
}
