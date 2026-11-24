import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';
import { tirerDesPersonnes } from './personnes.js';

describe('tirerDesPersonnes', () => {
  const personnes = tirerDesPersonnes(creerAlea(42), 100);

  it('tire le nombre demandé de personnes, toutes distinctes', () => {
    expect(personnes).toHaveLength(100);
    expect(new Set(personnes.map((p) => `${p.prenom} ${p.nom}`)).size).toBe(100);
  });

  it('donne des adresses sous un domaine réservé .test, sans accent', () => {
    for (const { courriel } of personnes) {
      expect(courriel).toMatch(/^[a-z0-9.-]+@[a-z-]+\.test$/);
    }
  });

  it('retire les accents de la partie locale', () => {
    const helene = tirerDesPersonnes(creerAlea(1), 300).find((p) => p.prenom === 'Hélène');
    expect(helene?.courriel).toMatch(/^helene\./);
  });

  it('donne des numéros de la tranche réservée à la fiction', () => {
    for (const { telephone } of personnes) {
      expect(telephone).toMatch(/^01 99 00 \d{2} \d{2}$/);
    }
  });

  it('accorde la civilité au prénom', () => {
    const feminins = [
      'Marie',
      'Nathalie',
      'Isabelle',
      'Sophie',
      'Claire',
      'Camille',
      'Léa',
      'Anne',
      'Hélène',
      'Céline',
    ];
    for (const { civilite, prenom } of personnes) {
      expect(feminins.includes(prenom)).toBe(civilite === 'Mme');
    }
  });

  it('refuse de tirer plus de personnes distinctes que de combinaisons possibles', () => {
    expect(() => tirerDesPersonnes(creerAlea(1), 401)).toThrow('Au plus 400 personnes distinctes');
  });
});
