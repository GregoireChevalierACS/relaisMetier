import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { cleDeTraitement, etatInitial } from './Traitement.js';

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
  it('met à trier un courriel qu’aucune règle n’écarte', () => {
    expect(etatInitial(null)).toEqual({ kind: 'a-trier' });
  });

  it('classe sans réponse, par règle, un courriel qu’une règle écarte', () => {
    expect(etatInitial('Envoi en nombre')).toEqual({
      kind: 'sans-reponse',
      motif: 'Envoi en nombre',
      par: 'regle',
    });
  });
});
