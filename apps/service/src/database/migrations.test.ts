import { afterEach, describe, expect, it } from 'vitest';

import { annuler, migrer, MIGRATIONS, type Migration } from './migrations.js';
import { uneBaseDeTest, type BaseDeTest } from './testing/baseDeTest.js';

const bases: BaseDeTest[] = [];
afterEach(async () => {
  await Promise.all(bases.splice(0).map((base) => base.fermer()));
});

async function base(): Promise<BaseDeTest> {
  const nouvelle = await uneBaseDeTest();
  bases.push(nouvelle);
  return nouvelle;
}

const tables = async ({ pool, schema }: BaseDeTest): Promise<string[]> => {
  const { rows } = await pool.query<{ table_name: string }>(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name',
    [schema],
  );
  return rows.map(({ table_name }) => table_name);
};

describe('migrations', () => {
  it('numérote les migrations sans trou ni doublon', () => {
    expect(MIGRATIONS.map(({ numero }) => numero)).toEqual(
      Array.from({ length: MIGRATIONS.length }, (_, index) => index + 1),
    );
  });

  it('applique toutes les migrations, puis rien de plus au démarrage suivant', async () => {
    const neuve = await base();
    expect(await migrer(neuve.pool)).toEqual(MIGRATIONS.map(({ numero }) => numero));
    expect(await migrer(neuve.pool)).toEqual([]);
    expect(await tables(neuve)).toEqual(['alertes', 'migrations', 'traitements']);
  });

  it('descend chaque migration, puis la remonte', async () => {
    const neuve = await base();
    await migrer(neuve.pool);
    expect(await annuler(neuve.pool, 0)).toEqual(
      [...MIGRATIONS].reverse().map(({ numero }) => numero),
    );
    expect(await tables(neuve)).toEqual(['migrations']);
    expect(await annuler(neuve.pool, 0)).toEqual([]);
    expect(await migrer(neuve.pool)).toEqual(MIGRATIONS.map(({ numero }) => numero));
  });

  it('applique les migrations dans l’ordre de leur numéro, quel que soit l’ordre de la liste', async () => {
    const neuve = await base();
    const enDesordre: Migration[] = [
      {
        numero: 2,
        nom: 'b',
        monter: 'ALTER TABLE a ADD COLUMN y int',
        descendre: 'ALTER TABLE a DROP COLUMN y',
      },
      { numero: 1, nom: 'a', monter: 'CREATE TABLE a (x int)', descendre: 'DROP TABLE a' },
    ];
    expect(await migrer(neuve.pool, enDesordre)).toEqual([1, 2]);
    expect(await annuler(neuve.pool, 1, enDesordre)).toEqual([2]);
  });

  it('annule entièrement une migration qui échoue en cours de route', async () => {
    const neuve = await base();
    const fautive: Migration = {
      numero: 1,
      nom: 'fautive',
      monter: 'CREATE TABLE a_moitie (x int); SELECT 1 / 0;',
      descendre: 'DROP TABLE a_moitie',
    };
    await expect(migrer(neuve.pool, [fautive])).rejects.toThrow('division by zero');
    // Rien n'a survécu, pas même la table des migrations créée dans la même transaction.
    expect(await tables(neuve)).toEqual([]);
    expect(await migrer(neuve.pool, [])).toEqual([]);
  });

  it('ne migre qu’une fois quand deux services démarrent en même temps', async () => {
    const neuve = await base();
    const [premier, second] = await Promise.all([migrer(neuve.pool), migrer(neuve.pool)]);
    expect([...premier, ...second].sort()).toEqual(MIGRATIONS.map(({ numero }) => numero));
  });
});
