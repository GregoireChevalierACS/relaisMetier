import { describe, expect, it } from 'vitest';

import { genererLesCasDEvaluation } from './evaluation.js';
import { genererLeJeu } from './jeu.js';

describe('genererLesCasDEvaluation', () => {
  it('donne les 50 courriels du jeu, avec les mêmes Message-ID, objets et attendus', async () => {
    const cas = genererLesCasDEvaluation(42);
    const { manifeste } = await genererLeJeu(42);
    expect(cas).toHaveLength(50);
    expect(
      cas.map(({ messageId, boite, objet, attendu }) => ({ messageId, boite, objet, attendu })),
    ).toEqual(
      manifeste.courriels.map(({ messageId, boite, objet, attendu }) => ({
        messageId,
        boite,
        objet,
        attendu,
      })),
    );
  });

  it('donne les mêmes cas pour la même graine', () => {
    expect(genererLesCasDEvaluation(7)).toEqual(genererLesCasDEvaluation(7));
  });
});
