import type { JournalDesTraitements } from '@relaismetier/application';
import type { CleDeTraitement, EtatDeTraitement, Traitement } from '@relaismetier/domain';
import type { Pool } from 'pg';
import { z } from 'zod';

/** Une ligne qui ne respecte pas le modèle : modifiée à la main ou corrompue. Une panne, pas un cas métier. */
export class StockCorrompu extends Error {
  override readonly name = 'StockCorrompu';
}

// Le stock est relu par les règles du domaine, jamais cru : une ligne invalide est une panne.
const schemaDeLigne = z.discriminatedUnion('etat', [
  z.object({
    cle: z.string(),
    boite: z.string(),
    id_courriel: z.string(),
    recu_le: z.date(),
    etat: z.literal('a-trier'),
    motif: z.null(),
    par: z.null(),
  }),
  z.object({
    cle: z.string(),
    boite: z.string(),
    id_courriel: z.string(),
    recu_le: z.date(),
    etat: z.literal('sans-reponse'),
    motif: z.string(),
    par: z.literal('regle'),
  }),
]);

function versLeTraitement(ligne: unknown): Traitement {
  const lu = schemaDeLigne.safeParse(ligne);
  if (!lu.success) throw new StockCorrompu('Ligne du journal des traitements invalide.');
  const { cle, boite, id_courriel: idCourriel, recu_le: recuLe } = lu.data;
  const etat: EtatDeTraitement =
    lu.data.etat === 'a-trier'
      ? { kind: 'a-trier' }
      : { kind: 'sans-reponse', motif: lu.data.motif, par: lu.data.par };
  return { cle, boite, idCourriel, recuLe: recuLe.getTime(), etat };
}

const versLesColonnes = ({ cle, boite, idCourriel, recuLe, etat }: Traitement): unknown[] => [
  cle,
  boite,
  idCourriel,
  new Date(recuLe),
  etat.kind,
  etat.kind === 'sans-reponse' ? etat.motif : null,
  etat.kind === 'sans-reponse' ? etat.par : null,
];

const COLONNES = 7;

/** Journal des traitements dans PostgreSQL : l'unicité de la clé garantit l'idempotence. */
export function creerLeJournalPostgres(pool: Pool): JournalDesTraitements {
  return {
    async inscrireLesNouveaux(traitements) {
      if (traitements.length === 0) return new Set<CleDeTraitement>();
      const valeurs = traitements.map(
        (_, ligne) =>
          `(${Array.from({ length: COLONNES }, (_c, colonne) => `$${String(ligne * COLONNES + colonne + 1)}`).join(', ')})`,
      );
      // Une seule instruction : deux relevés simultanés ne peuvent pas inscrire la même clé.
      const { rows } = await pool.query<{ cle: string }>(
        `INSERT INTO traitements (cle, boite, id_courriel, recu_le, etat, motif, par)
         VALUES ${valeurs.join(', ')}
         ON CONFLICT (cle) DO NOTHING
         RETURNING cle`,
        traitements.flatMap(versLesColonnes),
      );
      return new Set(rows.map(({ cle }) => cle));
    },

    async lire(cle) {
      // Lignes typées unknown : c'est versLeTraitement qui les valide.
      const { rows } = await pool.query<Record<string, unknown>>(
        'SELECT cle, boite, id_courriel, recu_le, etat, motif, par FROM traitements WHERE cle = $1',
        [cle],
      );
      const [ligne] = rows;
      return ligne === undefined ? null : versLeTraitement(ligne);
    },
  };
}
