import { randomBytes } from 'node:crypto';

import pg from 'pg';

// Les tests du journal parlent à un vrai PostgreSQL : la base jetable de Compose en local
// (docker compose --profile tests up -d postgres-tests), un service Docker en CI. Chaque appel crée
// un schéma neuf : les tests ne se voient pas entre eux.

export const URL_DE_LA_BASE_DE_TEST =
  process.env['URL_DE_LA_BASE_DE_TEST'] ?? 'postgres://postgres:test@127.0.0.1:5433/postgres';

export interface BaseDeTest {
  readonly pool: pg.Pool;
  readonly schema: string;
  fermer(): Promise<void>;
}

export async function uneBaseDeTest(): Promise<BaseDeTest> {
  const schema = `test_${randomBytes(6).toString('hex')}`;
  const administration = new pg.Pool({ connectionString: URL_DE_LA_BASE_DE_TEST, max: 1 });
  await administration.query(`CREATE SCHEMA ${schema}`);
  await administration.end();
  const pool = new pg.Pool({
    connectionString: URL_DE_LA_BASE_DE_TEST,
    options: `-c search_path=${schema}`,
    max: 5,
  });
  return {
    pool,
    schema,
    async fermer() {
      await pool.query(`DROP SCHEMA ${schema} CASCADE`);
      await pool.end();
    },
  };
}
