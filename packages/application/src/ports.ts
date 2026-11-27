import type { Courriel } from '@mailhelper/domain';
import type { CleDeTraitement, EtatDeTraitement, Traitement } from '@relaismetier/domain';

/**
 * Le journal des courriels relevés : ce qui garantit qu'un courriel relu deux fois (n8n réessaie,
 * deux relevés se chevauchent) n'est traité qu'une fois. Contrat vérifié par
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
  /**
   * Réserve, jusqu'à `maintenant + duree`, les plus anciens courriels à trier de la boîte, et les
   * renvoie. Deux réservations simultanées sont disjointes : deux tris qui se chevauchent ne
   * traitent jamais le même courriel. Une réservation expirée (tri interrompu) est reprise.
   */
  reserverLesATrier(reservation: ReservationDeTri): Promise<readonly Traitement[]>;
  /** Enregistre l'issue du tri d'un courriel réservé, et lève sa réservation. */
  terminer(cle: CleDeTraitement, etat: EtatDeTraitement): Promise<void>;
}

export interface ReservationDeTri {
  readonly boite: string;
  readonly limite: number;
  readonly maintenant: number;
  readonly dureeEnMillisecondes: number;
}

/**
 * Décide si un courriel attend une réponse (petit modèle). La réponse est une donnée externe,
 * renvoyée telle quelle (`unknown`) et validée par la couche application.
 */
export interface Trieur {
  trier(courriel: Courriel): Promise<unknown>;
}

/** Rédige le corps d'une réponse à un courriel (modèle plus grand), validé de même. */
export interface Redacteur {
  rediger(courriel: Courriel): Promise<unknown>;
}
