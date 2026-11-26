import { cleDeTraitement, type Traitement } from '@relaismetier/domain';
import { describe, expect, it } from 'vitest';

import type { JournalDesTraitements } from '../ports.js';

/** Fabrique un journal neuf et vide. */
export type FabriqueDeJournal = () => Promise<JournalDesTraitements>;

export const unTraitement = (surcharges: Partial<Traitement> = {}): Traitement => {
  const boite = surcharges.boite ?? 'devis';
  const idCourriel = surcharges.idCourriel ?? '1795599810:1';
  return {
    cle: cleDeTraitement(boite, idCourriel),
    boite,
    idCourriel,
    recuLe: 1_793_437_200_000,
    etat: { kind: 'a-trier' },
    ...surcharges,
  };
};

/**
 * Comportement exigé de tout journal des traitements. La même suite tient la doublure en mémoire
 * et le journal PostgreSQL : l'idempotence ne peut pas passer grâce à une doublure arrangeante.
 */
export function verifierLeContratDuJournal(nom: string, fabriquer: FabriqueDeJournal): void {
  describe(`contrat du journal des traitements : ${nom}`, () => {
    it('inscrit des traitements nouveaux et les relit à l’identique', async () => {
      const journal = await fabriquer();
      const aTrier = unTraitement();
      const ecarte = unTraitement({
        idCourriel: '1795599810:2',
        cle: cleDeTraitement('devis', '1795599810:2'),
        recuLe: 1_793_437_200_123,
        etat: {
          kind: 'sans-reponse',
          motif: 'Envoi en nombre : aucune réponse attendue.',
          par: 'regle',
        },
      });

      const inscrites = await journal.inscrireLesNouveaux([aTrier, ecarte]);

      expect([...inscrites].sort()).toEqual([aTrier.cle, ecarte.cle]);
      expect(await journal.lire(aTrier.cle)).toEqual(aTrier);
      expect(await journal.lire(ecarte.cle)).toEqual(ecarte);
    });

    it('ignore une clé déjà inscrite, sans modifier ce qui l’était', async () => {
      const journal = await fabriquer();
      const premier = unTraitement();
      await journal.inscrireLesNouveaux([premier]);

      const relu = unTraitement({ etat: { kind: 'sans-reponse', motif: 'autre', par: 'regle' } });
      const nouveau = unTraitement({ idCourriel: '9:9', cle: cleDeTraitement('devis', '9:9') });
      const inscrites = await journal.inscrireLesNouveaux([relu, nouveau]);

      expect([...inscrites]).toEqual([nouveau.cle]);
      expect(await journal.lire(premier.cle)).toEqual(premier);
    });

    it('distingue le même identifiant de courriel dans deux boîtes', async () => {
      const journal = await fabriquer();
      const devis = unTraitement({
        boite: 'devis',
        cle: cleDeTraitement('devis', '1:1'),
        idCourriel: '1:1',
      });
      const accueil = unTraitement({
        boite: 'accueil',
        cle: cleDeTraitement('accueil', '1:1'),
        idCourriel: '1:1',
      });
      expect((await journal.inscrireLesNouveaux([devis, accueil])).size).toBe(2);
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
  });
}
