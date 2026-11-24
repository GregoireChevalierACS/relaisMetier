import { describe, expect, it } from 'vitest';

import { creerVerificateurDeSecret } from './authentification.js';

describe('creerVerificateurDeSecret', () => {
  const secretValide = creerVerificateurDeSecret('le-bon-secret');

  it('accepte le secret attendu', () => {
    expect(secretValide('le-bon-secret')).toBe(true);
  });

  it.each([
    ['absent', undefined],
    ['vide', ''],
    ['différent', 'le-bon-secreT'],
    ['plus long', 'le-bon-secret-et-plus'],
    ['préfixe', 'le-bon'],
  ])('refuse un secret %s', (_cas, recu) => {
    expect(secretValide(recu)).toBe(false);
  });
});
