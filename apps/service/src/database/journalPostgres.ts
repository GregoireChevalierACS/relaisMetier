import type { JournalDesTraitements } from '@relaismetier/application';
import { tentativesDe, type EtatDeTraitement, type Traitement } from '@relaismetier/domain';
import type { Pool } from 'pg';
import { z } from 'zod';

/** Une ligne qui ne respecte pas le modèle : modifiée à la main ou corrompue. Une panne, pas un cas métier. */
export class StockCorrompu extends Error {
  override readonly name = 'StockCorrompu';
}

const COLONNES_LUES = 'cle, boite, id_courriel, recu_le, etat, motif, par, cause, tentatives';

const commun = {
  cle: z.string(),
  boite: z.string(),
  id_courriel: z.string(),
  recu_le: z.date(),
  tentatives: z.number().int().nonnegative(),
};

// Le stock est relu par les règles du domaine, jamais cru : une ligne invalide est une panne.
const schemaDeLigne = z.discriminatedUnion('etat', [
  z.object({
    ...commun,
    etat: z.literal('a-trier'),
    motif: z.null(),
    par: z.null(),
    cause: z.null(),
  }),
  z.object({
    ...commun,
    etat: z.literal('sans-reponse'),
    motif: z.string(),
    par: z.enum(['regle', 'modele']),
    cause: z.null(),
  }),
  z.object({
    ...commun,
    etat: z.literal('brouillon-depose'),
    motif: z.string(),
    par: z.null(),
    cause: z.null(),
  }),
  z.object({
    ...commun,
    etat: z.literal('mis-de-cote'),
    motif: z.null(),
    par: z.null(),
    cause: z.string(),
  }),
]);

function etatDeLaLigne(ligne: z.infer<typeof schemaDeLigne>): EtatDeTraitement {
  switch (ligne.etat) {
    case 'a-trier':
      return { kind: 'a-trier', tentatives: ligne.tentatives };
    case 'sans-reponse':
      return { kind: 'sans-reponse', motif: ligne.motif, par: ligne.par };
    case 'brouillon-depose':
      return { kind: 'brouillon-depose', motif: ligne.motif };
    case 'mis-de-cote':
      return { kind: 'mis-de-cote', cause: ligne.cause, tentatives: ligne.tentatives };
  }
}

function versLeTraitement(ligne: unknown): Traitement {
  const lu = schemaDeLigne.safeParse(ligne);
  if (!lu.success) throw new StockCorrompu('Ligne du journal des traitements invalide.');
  const { cle, boite, id_courriel: idCourriel, recu_le: recuLe } = lu.data;
  return { cle, boite, idCourriel, recuLe: recuLe.getTime(), etat: etatDeLaLigne(lu.data) };
}

/** Colonnes d'état : etat, motif, par, cause, tentatives. */
function colonnesDeLEtat(etat: EtatDeTraitement): unknown[] {
  const motif =
    etat.kind === 'sans-reponse' || etat.kind === 'brouillon-depose' ? etat.motif : null;
  const par = etat.kind === 'sans-reponse' ? etat.par : null;
  const cause = etat.kind === 'mis-de-cote' ? etat.cause : null;
  return [etat.kind, motif, par, cause, tentativesDe(etat)];
}

const COLONNES_INSCRITES = 9;

/** Journal des traitements dans PostgreSQL : l'unicité de la clé garantit l'idempotence. */
export function creerLeJournalPostgres(pool: Pool): JournalDesTraitements {
  return {
    async inscrireLesNouveaux(traitements) {
      if (traitements.length === 0) return new Set<string>();
      const valeurs = traitements.map(
        (_, ligne) =>
          `(${Array.from({ length: COLONNES_INSCRITES }, (_c, colonne) => `$${String(ligne * COLONNES_INSCRITES + colonne + 1)}`).join(', ')})`,
      );
      // Une seule instruction : deux relevés simultanés ne peuvent pas inscrire la même clé.
      const { rows } = await pool.query<{ cle: string }>(
        `INSERT INTO traitements (cle, boite, id_courriel, recu_le, etat, motif, par, cause, tentatives)
         VALUES ${valeurs.join(', ')}
         ON CONFLICT (cle) DO NOTHING
         RETURNING cle`,
        traitements.flatMap(({ cle, boite, idCourriel, recuLe, etat }) => [
          cle,
          boite,
          idCourriel,
          new Date(recuLe),
          ...colonnesDeLEtat(etat),
        ]),
      );
      return new Set(rows.map(({ cle }) => cle));
    },

    async lire(cle) {
      // Lignes typées unknown : c'est versLeTraitement qui les valide.
      const { rows } = await pool.query<Record<string, unknown>>(
        `SELECT ${COLONNES_LUES} FROM traitements WHERE cle = $1`,
        [cle],
      );
      const [ligne] = rows;
      return ligne === undefined ? null : versLeTraitement(ligne);
    },

    async reserverLesATrier({ boite, limite, maintenant, dureeEnMillisecondes }) {
      // SKIP LOCKED : deux réservations simultanées se partagent les lignes au lieu de les
      // prendre deux fois ou de s'attendre.
      const { rows } = await pool.query<Record<string, unknown>>(
        `UPDATE traitements SET reserve_jusqua = $4
         WHERE cle IN (
           SELECT cle FROM traitements
           WHERE boite = $1 AND etat = 'a-trier' AND (reserve_jusqua IS NULL OR reserve_jusqua <= $2)
           ORDER BY recu_le, cle
           LIMIT $3
           FOR UPDATE SKIP LOCKED
         )
         RETURNING ${COLONNES_LUES}`,
        [boite, new Date(maintenant), limite, new Date(maintenant + dureeEnMillisecondes)],
      );
      // RETURNING ne garantit aucun ordre : on retrie comme la sélection.
      return rows
        .map(versLeTraitement)
        .sort((a, b) => a.recuLe - b.recuLe || a.cle.localeCompare(b.cle));
    },

    async terminer(cle, etat) {
      const { rowCount } = await pool.query(
        `UPDATE traitements
         SET etat = $2, motif = $3, par = $4, cause = $5, tentatives = $6,
             reserve_jusqua = NULL, version = version + 1
         WHERE cle = $1`,
        [cle, ...colonnesDeLEtat(etat)],
      );
      if (rowCount === 0) throw new StockCorrompu(`Traitement inconnu : ${cle}.`);
    },
  };
}
