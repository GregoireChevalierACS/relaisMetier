import type { JournalDesAlertes } from '@relaismetier/application';
import { alerteDue } from '@relaismetier/domain';
import type { Pool } from 'pg';
import { z } from 'zod';

import { StockCorrompu } from './journalPostgres.js';

const schemaDeLigne = z.object({
  derniere_alerte_le: z.date().nullable(),
  occurrences: z.number().int().nonnegative(),
});

/**
 * Journal des alertes dans PostgreSQL. La règle (une alerte par heure et par cause) reste celle du
 * domaine : la ligne est verrouillée (FOR UPDATE), relue, jugée par `alerteDue`, puis mise à jour,
 * dans une seule transaction. Deux pannes simultanées de même cause s'attendent l'une l'autre.
 */
export function creerLeJournalDesAlertesPostgres(pool: Pool): JournalDesAlertes {
  return {
    async enregistrer(cause, maintenant) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'INSERT INTO alertes (cause) VALUES ($1) ON CONFLICT (cause) DO NOTHING',
          [cause],
        );
        const { rows } = await client.query<Record<string, unknown>>(
          'SELECT derniere_alerte_le, occurrences FROM alertes WHERE cause = $1 FOR UPDATE',
          [cause],
        );
        const lu = schemaDeLigne.safeParse(rows[0]);
        if (!lu.success) throw new StockCorrompu('Ligne du journal des alertes invalide.');
        const due = alerteDue(lu.data.derniere_alerte_le?.getTime() ?? null, maintenant);
        const occurrences = lu.data.occurrences + 1;
        await client.query(
          'UPDATE alertes SET occurrences = $2, derniere_alerte_le = COALESCE($3, derniere_alerte_le) WHERE cause = $1',
          [cause, occurrences, due ? new Date(maintenant) : null],
        );
        await client.query('COMMIT');
        return { due, occurrences };
      } catch (erreur) {
        await client.query('ROLLBACK');
        throw erreur;
      } finally {
        client.release();
      }
    },
  };
}
