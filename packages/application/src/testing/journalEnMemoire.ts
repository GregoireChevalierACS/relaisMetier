import type { CleDeTraitement, Traitement } from '@relaismetier/domain';

import type { JournalDesTraitements } from '../ports.js';

/** Journal en mémoire, tenu par le même contrat que le journal PostgreSQL. */
export class JournalEnMemoire implements JournalDesTraitements {
  private readonly traitements = new Map<CleDeTraitement, Traitement>();

  inscrireLesNouveaux(traitements: readonly Traitement[]): Promise<ReadonlySet<CleDeTraitement>> {
    const inscrites = new Set<CleDeTraitement>();
    // Synchrone entre deux await : rien ne peut s'intercaler, comme une transaction.
    for (const traitement of traitements) {
      if (this.traitements.has(traitement.cle)) continue;
      this.traitements.set(traitement.cle, traitement);
      inscrites.add(traitement.cle);
    }
    return Promise.resolve(inscrites);
  }

  lire(cle: CleDeTraitement): Promise<Traitement | null> {
    return Promise.resolve(this.traitements.get(cle) ?? null);
  }
}

export const journalEnPanne = (): JournalDesTraitements => ({
  inscrireLesNouveaux: () => Promise.reject(new Error('base injoignable')),
  lire: () => Promise.reject(new Error('base injoignable')),
});
