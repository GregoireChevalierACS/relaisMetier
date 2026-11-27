import type { Pool, PoolClient } from 'pg';

/**
 * Une évolution du schéma. Une migration livrée n'est jamais modifiée : on en ajoute une autre.
 * Chacune se monte et se descend dans une transaction, et les deux sens sont testés.
 */
export interface Migration {
  readonly numero: number;
  readonly nom: string;
  readonly monter: string;
  readonly descendre: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    numero: 1,
    nom: 'journal-des-traitements',
    monter: `
      CREATE TABLE traitements (
        cle          text PRIMARY KEY,
        boite        text NOT NULL,
        id_courriel  text NOT NULL,
        recu_le      timestamptz(3) NOT NULL,
        etat         text NOT NULL CHECK (etat IN ('a-trier', 'sans-reponse')),
        motif        text,
        par          text CHECK (par IN ('regle')),
        -- Version de la ligne : une écriture indique la version lue (concurrence optimiste).
        version      integer NOT NULL DEFAULT 1,
        inscrit_le   timestamptz NOT NULL DEFAULT now(),
        -- Un motif et son auteur ensemble, et seulement pour un courriel sans réponse.
        CHECK (
          (etat = 'sans-reponse' AND motif IS NOT NULL AND par IS NOT NULL)
          OR (etat <> 'sans-reponse' AND motif IS NULL AND par IS NULL)
        )
      );
      CREATE INDEX traitements_a_trier ON traitements (boite, recu_le) WHERE etat = 'a-trier';
    `,
    descendre: 'DROP TABLE traitements;',
  },
  {
    numero: 2,
    nom: 'tri-des-traitements',
    monter: `
      ALTER TABLE traitements
        DROP CONSTRAINT traitements_check,
        DROP CONSTRAINT traitements_etat_check,
        DROP CONSTRAINT traitements_par_check,
        ADD COLUMN tentatives integer NOT NULL DEFAULT 0 CHECK (tentatives >= 0),
        ADD COLUMN cause text,
        -- Réservé par un tri jusqu'à cette date : un autre tri ne le prend pas avant.
        ADD COLUMN reserve_jusqua timestamptz;
      -- Chaque état n'a que les colonnes qui le décrivent.
      ALTER TABLE traitements ADD CONSTRAINT traitements_etat_valide CHECK (
        (etat = 'a-trier' AND motif IS NULL AND par IS NULL AND cause IS NULL)
        OR (etat = 'sans-reponse' AND motif IS NOT NULL AND par IN ('regle', 'modele')
            AND cause IS NULL AND tentatives = 0)
        OR (etat = 'brouillon-depose' AND motif IS NOT NULL AND par IS NULL AND cause IS NULL
            AND tentatives = 0)
        OR (etat = 'mis-de-cote' AND cause IS NOT NULL AND motif IS NULL AND par IS NULL)
      );
    `,
    // Descente possible seulement tant qu'aucun courriel n'a été trié : les nouveaux états n'ont
    // pas d'équivalent dans le schéma précédent, et la contrainte rétablie le refuse.
    descendre: `
      ALTER TABLE traitements
        DROP CONSTRAINT traitements_etat_valide,
        DROP COLUMN reserve_jusqua,
        DROP COLUMN cause,
        DROP COLUMN tentatives,
        ADD CONSTRAINT traitements_etat_check CHECK (etat IN ('a-trier', 'sans-reponse')),
        ADD CONSTRAINT traitements_par_check CHECK (par IN ('regle')),
        ADD CONSTRAINT traitements_check CHECK (
          (etat = 'sans-reponse' AND motif IS NOT NULL AND par IS NOT NULL)
          OR (etat <> 'sans-reponse' AND motif IS NULL AND par IS NULL)
        );
    `,
  },
];

/** Verrou consultatif pris par chaque migration : deux services qui démarrent ne migrent pas ensemble. */
const VERROU_DES_MIGRATIONS = 7_211_042;

async function enTransaction<T>(
  pool: Pool,
  action: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [VERROU_DES_MIGRATIONS]);
    const resultat = await action(client);
    await client.query('COMMIT');
    return resultat;
  } catch (erreur) {
    await client.query('ROLLBACK');
    throw erreur;
  } finally {
    client.release();
  }
}

const appliquees = async (client: PoolClient): Promise<Set<number>> => {
  await client.query(
    'CREATE TABLE IF NOT EXISTS migrations (numero integer PRIMARY KEY, nom text NOT NULL, appliquee_le timestamptz NOT NULL DEFAULT now())',
  );
  const { rows } = await client.query<{ numero: number }>('SELECT numero FROM migrations');
  return new Set(rows.map(({ numero }) => numero));
};

/** Applique, dans l'ordre et chacune dans sa transaction, les migrations pas encore appliquées. */
export async function migrer(
  pool: Pool,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number[]> {
  const faites: number[] = [];
  for (const migration of [...migrations].sort((a, b) => a.numero - b.numero)) {
    const appliquee = await enTransaction(pool, async (client) => {
      if ((await appliquees(client)).has(migration.numero)) return false;
      await client.query(migration.monter);
      await client.query('INSERT INTO migrations (numero, nom) VALUES ($1, $2)', [
        migration.numero,
        migration.nom,
      ]);
      return true;
    });
    if (appliquee) faites.push(migration.numero);
  }
  return faites;
}

/** Descend, de la plus récente à la plus ancienne, les migrations appliquées après `jusqua`. */
export async function annuler(
  pool: Pool,
  jusqua: number,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<number[]> {
  const defaites: number[] = [];
  for (const migration of [...migrations].sort((a, b) => b.numero - a.numero)) {
    if (migration.numero <= jusqua) continue;
    const defaite = await enTransaction(pool, async (client) => {
      if (!(await appliquees(client)).has(migration.numero)) return false;
      await client.query(migration.descendre);
      await client.query('DELETE FROM migrations WHERE numero = $1', [migration.numero]);
      return true;
    });
    if (defaite) defaites.push(migration.numero);
  }
  return defaites;
}
