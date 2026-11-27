import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  apresUnEchec,
  cleDeTraitement,
  etatInitial,
  tentativesDe,
  TENTATIVES_MAXIMALES,
  type EtatDeTraitement,
} from './Traitement.js';

describe('cleDeTraitement', () => {
  it('joint la boîte et l’identifiant du courriel', () => {
    expect(cleDeTraitement('devis', '1795599810:42')).toBe('devis/1795599810:42');
  });

  it('distingue le même identifiant dans deux boîtes', () => {
    expect(cleDeTraitement('devis', '1:1')).not.toBe(cleDeTraitement('accueil', '1:1'));
  });

  it('donne deux clés différentes pour deux courriels différents de la même boîte', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (a, b) => {
        fc.pre(a !== b);
        expect(cleDeTraitement('devis', a)).not.toBe(cleDeTraitement('devis', b));
      }),
    );
  });
});

describe('etatInitial', () => {
  it('met à trier, sans tentative, un courriel qu’aucune règle n’écarte', () => {
    expect(etatInitial(null)).toEqual({ kind: 'a-trier', tentatives: 0 });
  });

  it('classe sans réponse, par règle, un courriel qu’une règle écarte', () => {
    expect(etatInitial('Envoi en nombre')).toEqual({
      kind: 'sans-reponse',
      motif: 'Envoi en nombre',
      par: 'regle',
    });
  });
});

describe('apresUnEchec', () => {
  it('remet à trier après un premier et un deuxième échec', () => {
    expect(apresUnEchec(0, 'tri')).toEqual({ kind: 'a-trier', tentatives: 1 });
    expect(apresUnEchec(1, 'tri')).toEqual({ kind: 'a-trier', tentatives: 2 });
  });

  it('met de côté au troisième échec, avec sa cause', () => {
    expect(TENTATIVES_MAXIMALES).toBe(3);
    expect(apresUnEchec(2, 'dépôt du brouillon')).toEqual({
      kind: 'mis-de-cote',
      cause: 'dépôt du brouillon',
      tentatives: 3,
    });
  });

  it('ne retente jamais indéfiniment : un courriel finit toujours trié ou mis de côté', () => {
    fc.assert(
      fc.property(fc.nat({ max: 20 }), (echecs) => {
        let etat = etatInitial(null);
        for (let i = 0; i < echecs && etat.kind === 'a-trier'; i += 1) {
          etat = apresUnEchec(etat.tentatives, 'panne');
        }
        expect(etat.kind === 'mis-de-cote').toBe(echecs >= TENTATIVES_MAXIMALES);
      }),
    );
  });
});

describe('tentativesDe', () => {
  it.each<[EtatDeTraitement, number]>([
    [{ kind: 'a-trier', tentatives: 2 }, 2],
    [{ kind: 'mis-de-cote', cause: 'tri', tentatives: 3 }, 3],
    [{ kind: 'sans-reponse', motif: 'robot', par: 'regle' }, 0],
    [{ kind: 'brouillon-depose', motif: 'question' }, 0],
  ])('compte les tentatives de %j', (etat, tentatives) => {
    expect(tentativesDe(etat)).toBe(tentatives);
  });
});
