import { unTraitement, verifierLeContratDuJournal } from '@relaismetier/application/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { creerLeJournalPostgres, StockCorrompu } from './journalPostgres.js';
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

verifierLeContratDuJournal('PostgreSQL', async () =>
  creerLeJournalPostgres((await uneBaseMigree()).pool),
);

describe('journal PostgreSQL', () => {
  it('signale une ligne modifiée à la main comme une panne, au lieu de la croire', async () => {
    const { pool } = await uneBaseMigree();
    const journal = creerLeJournalPostgres(pool);
    const traitement = unTraitement();
    await journal.inscrireLesNouveaux([traitement]);
    // Contourne la contrainte d'état pour simuler une ligne corrompue.
    await pool.query('ALTER TABLE traitements DROP CONSTRAINT traitements_etat_check');
    await pool.query("UPDATE traitements SET etat = 'inconnu'");

    await expect(journal.lire(traitement.cle)).rejects.toThrow(StockCorrompu);
  });

  it('refuse à l’écriture un état incohérent (motif sans état sans-réponse)', async () => {
    const { pool } = await uneBaseMigree();
    await expect(
      pool.query(
        "INSERT INTO traitements (cle, boite, id_courriel, recu_le, etat, motif) VALUES ('a/1', 'a', '1', now(), 'a-trier', 'motif')",
      ),
    ).rejects.toThrow('check constraint');
  });

  it('inscrit un grand lot en une seule instruction', async () => {
    const journal = creerLeJournalPostgres((await uneBaseMigree()).pool);
    const lot = Array.from({ length: 200 }, (_, index) =>
      unTraitement({ idCourriel: `1:${String(index)}`, cle: `devis/1:${String(index)}` }),
    );
    expect((await journal.inscrireLesNouveaux(lot)).size).toBe(200);
  });
});
