import { alerteDue, INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES } from '@relaismetier/domain';
import { describe, expect, it } from 'vitest';

import type { JournalDesAlertes } from '../ports.js';

/** Journal des alertes en mémoire, tenu par le même contrat que PostgreSQL. */
export class JournalDesAlertesEnMemoire implements JournalDesAlertes {
  private readonly causes = new Map<string, { derniere: number | null; occurrences: number }>();

  enregistrer(cause: string, maintenant: number) {
    // Synchrone entre deux await : rien ne peut s'intercaler, comme une transaction.
    const precedent = this.causes.get(cause) ?? { derniere: null, occurrences: 0 };
    const due = alerteDue(precedent.derniere, maintenant);
    const occurrences = precedent.occurrences + 1;
    this.causes.set(cause, { derniere: due ? maintenant : precedent.derniere, occurrences });
    return Promise.resolve({ due, occurrences });
  }
}

const MAINTENANT = 1_793_437_200_000;
const HEURE = INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES;

/** Comportement exigé de tout journal des alertes : la doublure comme PostgreSQL. */
export function verifierLeContratDuJournalDesAlertes(
  nom: string,
  fabriquer: () => Promise<JournalDesAlertes>,
): void {
  describe(`contrat du journal des alertes : ${nom}`, () => {
    it('alerte à la première occurrence, puis plus dans l’heure, puis de nouveau après', async () => {
      const journal = await fabriquer();
      expect(await journal.enregistrer('panne', MAINTENANT)).toEqual({ due: true, occurrences: 1 });
      expect(await journal.enregistrer('panne', MAINTENANT + HEURE - 1)).toEqual({
        due: false,
        occurrences: 2,
      });
      expect(await journal.enregistrer('panne', MAINTENANT + HEURE)).toEqual({
        due: true,
        occurrences: 3,
      });
      // L'heure repart de la dernière alerte envoyée, pas de la dernière occurrence.
      expect(await journal.enregistrer('panne', MAINTENANT + 2 * HEURE - 1)).toEqual({
        due: false,
        occurrences: 4,
      });
    });

    it('traite chaque cause à part', async () => {
      const journal = await fabriquer();
      await journal.enregistrer('a', MAINTENANT);
      expect(await journal.enregistrer('b', MAINTENANT)).toEqual({ due: true, occurrences: 1 });
    });

    it('n’envoie qu’une alerte quand la même panne arrive plusieurs fois en même temps', async () => {
      const journal = await fabriquer();
      const reponses = await Promise.all(
        Array.from({ length: 5 }, () => journal.enregistrer('panne', MAINTENANT)),
      );
      expect(reponses.filter(({ due }) => due)).toHaveLength(1);
      expect(reponses.map(({ occurrences }) => occurrences).sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });
}
