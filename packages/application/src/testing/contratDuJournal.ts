import { cleDeTraitement, type EtatDeTraitement, type Traitement } from '@relaismetier/domain';
import { describe, expect, it } from 'vitest';

import type { JournalDesTraitements } from '../ports.js';

/** Fabrique un journal neuf et vide. */
export type FabriqueDeJournal = () => Promise<JournalDesTraitements>;

const INSTANT = 1_793_437_200_000;
const UNE_MINUTE = 60_000;

export const unTraitement = (surcharges: Partial<Traitement> = {}): Traitement => {
  const boite = surcharges.boite ?? 'devis';
  const idCourriel = surcharges.idCourriel ?? '1795599810:1';
  return {
    cle: cleDeTraitement(boite, idCourriel),
    boite,
    idCourriel,
    recuLe: INSTANT,
    etat: { kind: 'a-trier', tentatives: 0 },
    ...surcharges,
  };
};

/** Un traitement à trier, reçu `minutes` minutes après l'instant de référence. */
const aTrier = (id: string, minutes: number, boite = 'devis'): Traitement =>
  unTraitement({
    boite,
    idCourriel: id,
    cle: cleDeTraitement(boite, id),
    recuLe: INSTANT + minutes * UNE_MINUTE,
  });

const reservation = (
  surcharges: { boite?: string; limite?: number; maintenant?: number } = {},
) => ({
  boite: 'devis',
  limite: 10,
  maintenant: INSTANT,
  dureeEnMillisecondes: 15 * UNE_MINUTE,
  ...surcharges,
});

const cles = (traitements: readonly Traitement[]): string[] => traitements.map(({ cle }) => cle);

/**
 * Comportement exigé de tout journal des traitements. La même suite tient la doublure en mémoire
 * et le journal PostgreSQL : l'idempotence et les réservations ne peuvent pas passer grâce à une
 * doublure arrangeante.
 */
export function verifierLeContratDuJournal(nom: string, fabriquer: FabriqueDeJournal): void {
  describe(`contrat du journal des traitements : ${nom}`, () => {
    it('inscrit des traitements nouveaux et les relit à l’identique', async () => {
      const journal = await fabriquer();
      const nouveau = unTraitement();
      const ecarte = unTraitement({
        idCourriel: '1795599810:2',
        cle: cleDeTraitement('devis', '1795599810:2'),
        recuLe: INSTANT + 123,
        etat: { kind: 'sans-reponse', motif: 'Envoi en nombre.', par: 'regle' },
      });

      const inscrites = await journal.inscrireLesNouveaux([nouveau, ecarte]);

      expect([...inscrites].sort()).toEqual([nouveau.cle, ecarte.cle]);
      expect(await journal.lire(nouveau.cle)).toEqual(nouveau);
      expect(await journal.lire(ecarte.cle)).toEqual(ecarte);
    });

    it('ignore une clé déjà inscrite, sans modifier ce qui l’était', async () => {
      const journal = await fabriquer();
      const premier = unTraitement();
      await journal.inscrireLesNouveaux([premier]);

      const relu = unTraitement({ etat: { kind: 'sans-reponse', motif: 'autre', par: 'regle' } });
      const nouveau = aTrier('9:9', 0);
      const inscrites = await journal.inscrireLesNouveaux([relu, nouveau]);

      expect([...inscrites]).toEqual([nouveau.cle]);
      expect(await journal.lire(premier.cle)).toEqual(premier);
    });

    it('distingue le même identifiant de courriel dans deux boîtes', async () => {
      const journal = await fabriquer();
      const lot = [aTrier('1:1', 0, 'devis'), aTrier('1:1', 0, 'accueil')];
      expect((await journal.inscrireLesNouveaux(lot)).size).toBe(2);
    });

    it('accepte une liste vide', async () => {
      const journal = await fabriquer();
      expect((await journal.inscrireLesNouveaux([])).size).toBe(0);
    });

    it('ne trouve rien pour une clé inconnue', async () => {
      const journal = await fabriquer();
      expect(await journal.lire(cleDeTraitement('devis', 'inconnu'))).toBeNull();
    });

    it('n’inscrit qu’une fois la même clé lors de deux relevés simultanés', async () => {
      const journal = await fabriquer();
      const lots = await Promise.all(
        Array.from({ length: 5 }, () => journal.inscrireLesNouveaux([unTraitement()])),
      );
      expect(lots.reduce((total, inscrites) => total + inscrites.size, 0)).toBe(1);
    });

    it('réserve les courriels à trier de la boîte, du plus ancien au plus récent, dans la limite', async () => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux([
        aTrier('3', 3),
        aTrier('1', 1),
        aTrier('2', 2),
        aTrier('4', 0, 'accueil'),
        unTraitement({
          idCourriel: '5',
          cle: cleDeTraitement('devis', '5'),
          etat: { kind: 'sans-reponse', motif: 'robot', par: 'regle' },
        }),
      ]);

      const reserves = await journal.reserverLesATrier(reservation({ limite: 2 }));

      expect(cles(reserves)).toEqual(['devis/1', 'devis/2']);
      expect(reserves[0]).toEqual(aTrier('1', 1));
    });

    it('départage par la clé deux courriels reçus au même instant', async () => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux([aTrier('b', 1), aTrier('a', 1), aTrier('c', 0)]);
      expect(cles(await journal.reserverLesATrier(reservation()))).toEqual([
        'devis/c',
        'devis/a',
        'devis/b',
      ]);
    });

    it('ne réserve pas deux fois un courriel tant que sa réservation court', async () => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux([aTrier('1', 1), aTrier('2', 2)]);

      const premiere = await journal.reserverLesATrier(reservation({ limite: 1 }));
      const seconde = await journal.reserverLesATrier(
        reservation({ maintenant: INSTANT + 14 * UNE_MINUTE }),
      );

      expect(cles(premiere)).toEqual(['devis/1']);
      expect(cles(seconde)).toEqual(['devis/2']);
    });

    it('reprend un courriel dont la réservation a expiré (tri interrompu)', async () => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux([aTrier('1', 1)]);
      await journal.reserverLesATrier(reservation());

      const reprise = await journal.reserverLesATrier(
        reservation({ maintenant: INSTANT + 16 * UNE_MINUTE }),
      );

      expect(cles(reprise)).toEqual(['devis/1']);
    });

    it('ne donne jamais le même courriel à deux réservations simultanées', async () => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux(Array.from({ length: 10 }, (_, i) => aTrier(String(i), i)));

      const lots = await Promise.all(
        Array.from({ length: 4 }, () => journal.reserverLesATrier(reservation({ limite: 4 }))),
      );
      const toutes = lots.flatMap(cles);

      expect(new Set(toutes).size).toBe(toutes.length);
      expect(toutes).toHaveLength(10);
    });

    it.each<[string, EtatDeTraitement]>([
      [
        'sans réponse, par le modèle',
        { kind: 'sans-reponse', motif: 'Simple information.', par: 'modele' },
      ],
      ['brouillon déposé', { kind: 'brouillon-depose', motif: 'Demande de devis.' }],
      ['mis de côté', { kind: 'mis-de-cote', cause: 'dépôt du brouillon', tentatives: 3 }],
    ])('termine un courriel réservé : %s, relu à l’identique', async (_cas, etat) => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux([aTrier('1', 1)]);
      await journal.reserverLesATrier(reservation());

      await journal.terminer('devis/1', etat);

      expect((await journal.lire('devis/1'))?.etat).toEqual(etat);
      expect(
        await journal.reserverLesATrier(reservation({ maintenant: INSTANT + 20 * UNE_MINUTE })),
      ).toEqual([]);
    });

    it('rend aussitôt réservable un courriel remis à trier après un échec', async () => {
      const journal = await fabriquer();
      await journal.inscrireLesNouveaux([aTrier('1', 1)]);
      await journal.reserverLesATrier(reservation());

      await journal.terminer('devis/1', { kind: 'a-trier', tentatives: 1 });

      const reprise = await journal.reserverLesATrier(reservation());
      expect(reprise.map(({ etat }) => etat)).toEqual([{ kind: 'a-trier', tentatives: 1 }]);
    });

    it('refuse de terminer un courriel inconnu', async () => {
      const journal = await fabriquer();
      await expect(
        journal.terminer('devis/inconnu', { kind: 'a-trier', tentatives: 1 }),
      ).rejects.toThrow();
    });
  });
}
