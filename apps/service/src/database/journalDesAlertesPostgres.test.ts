import { verifierLeContratDuJournalDesAlertes } from '@relaismetier/application/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { creerLeJournalDesAlertesPostgres } from './journalDesAlertesPostgres.js';
import { StockCorrompu } from './journalPostgres.js';
import { migrer } from './migrations.js';
import { uneBaseDeTest, type BaseDeTest } from './testing/baseDeTest.js';

const bases: BaseDeTest[] = [];
afterEach(async () => {
  await Promise.all(bases.splice(0).map((base) => base.fermer()));
});

async function uneBaseMigree(): Promise<BaseDeTest> {
  const base = await uneBaseDeTest();
  bases.push(base);
  await migrer(base.pool);
  return base;
}

verifierLeContratDuJournalDesAlertes('PostgreSQL', async () =>
  creerLeJournalDesAlertesPostgres((await uneBaseMigree()).pool),
);

describe('journal des alertes PostgreSQL', () => {
  it('signale une ligne modifiée à la main comme une panne, et n’écrit rien', async () => {
    const { pool } = await uneBaseMigree();
    await pool.query('ALTER TABLE alertes DROP CONSTRAINT alertes_occurrences_check');
    await pool.query("INSERT INTO alertes (cause, occurrences) VALUES ('panne', -1)");

    await expect(creerLeJournalDesAlertesPostgres(pool).enregistrer('panne', 0)).rejects.toThrow(
      StockCorrompu,
    );
    const { rows } = await pool.query<{ occurrences: number }>('SELECT occurrences FROM alertes');
    expect(rows).toEqual([{ occurrences: -1 }]);
  });
});
