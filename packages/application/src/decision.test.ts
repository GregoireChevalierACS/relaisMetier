import { unCourriel } from '@mailhelper/application/testing';
import { describe, expect, it } from 'vitest';

import { deciderDuTri } from './decision.js';

describe('deciderDuTri', () => {
  it('suit le modèle quand aucune règle ne tranche', () => {
    expect(deciderDuTri(unCourriel(), { reponseAttendue: true, motif: 'Question.' })).toEqual({
      kind: 'reponse-attendue',
      motif: 'Question.',
    });
    expect(deciderDuTri(unCourriel(), { reponseAttendue: false, motif: 'Information.' })).toEqual({
      kind: 'sans-reponse',
      motif: 'Information.',
      par: 'modele',
    });
  });

  it('laisse les règles de mailHelper l’emporter sur le modèle', () => {
    const lettre = unCourriel({ diffusionDeMasse: true });
    expect(deciderDuTri(lettre, { reponseAttendue: true, motif: 'Question.' })).toMatchObject({
      kind: 'sans-reponse',
      par: 'regle',
    });
  });

  it.each([
    ['texte libre', 'Oui'],
    ['champ manquant', { reponseAttendue: true }],
    ['champ en trop', { reponseAttendue: true, motif: 'm', note: 1 }],
  ])('refuse une réponse hors format : %s', (_cas, reponse) => {
    expect(deciderDuTri(unCourriel(), reponse)).toEqual({ kind: 'reponse-invalide' });
  });
});
