import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';

const tirages = (graine: number, nombre: number): number[] => {
  const alea = creerAlea(graine);
  return Array.from({ length: nombre }, () => alea.suivant());
};

describe('creerAlea', () => {
  it('donne la même suite pour la même graine', () => {
    expect(tirages(42, 20)).toEqual(tirages(42, 20));
  });

  it('donne une autre suite pour une autre graine', () => {
    expect(tirages(42, 20)).not.toEqual(tirages(43, 20));
  });

  it('tire dans [0, 1[', () => {
    for (const valeur of tirages(7, 1000)) {
      expect(valeur).toBeGreaterThanOrEqual(0);
      expect(valeur).toBeLessThan(1);
    }
  });

  it('tire des entiers dans les bornes, bornes comprises', () => {
    const alea = creerAlea(1);
    const vus = new Set(Array.from({ length: 200 }, () => alea.entier(3, 6)));
    expect([...vus].sort()).toEqual([3, 4, 5, 6]);
  });

  it.each([
    [2, 1],
    [1.5, 3],
    [1, Number.NaN],
  ])('refuse les bornes [%s, %s]', (min, max) => {
    expect(() => creerAlea(1).entier(min, max)).toThrow(RangeError);
  });

  it('choisit un élément de la liste', () => {
    const alea = creerAlea(3);
    expect(['a', 'b', 'c']).toContain(alea.choisir(['a', 'b', 'c']));
  });

  it('refuse de choisir dans une liste vide', () => {
    expect(() => creerAlea(3).choisir([])).toThrow('liste vide');
  });

  it('mélange sans perdre ni dupliquer, et sans toucher à la liste d’origine', () => {
    const liste = [1, 2, 3, 4, 5, 6, 7, 8];
    const melange = creerAlea(5).melanger(liste);
    expect([...melange].sort()).toEqual(liste);
    expect(melange).not.toEqual(liste);
    expect(liste).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});
