import type { CleDeTraitement, Traitement } from '@relaismetier/domain';

/**
 * Le journal des courriels déjà relevés : ce qui garantit qu'un courriel relu deux fois (n8n
 * réessaie, deux relevés se chevauchent) n'est traité qu'une fois. Contrat vérifié par
 * `verifierLeContratDuJournal`, pour la doublure en mémoire comme pour PostgreSQL.
 */
export interface JournalDesTraitements {
  /**
   * Inscrit les traitements dont la clé est encore inconnue, ignore les autres sans les modifier,
   * et renvoie les clés effectivement inscrites. Atomique par clé : deux inscriptions simultanées
   * de la même clé n'en retiennent qu'une.
   */
  inscrireLesNouveaux(traitements: readonly Traitement[]): Promise<ReadonlySet<CleDeTraitement>>;
  lire(cle: CleDeTraitement): Promise<Traitement | null>;
}
