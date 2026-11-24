import { describe, expect, it } from 'vitest';

import { formaterDate, formaterEuros, formaterTaux } from './format.js';

describe('formaterEuros', () => {
  it.each([
    [0, '0,00 €'],
    [5, '0,05 €'],
    [99_999, '999,99 €'],
    [123_456, '1 234,56 €'],
    [123_456_789, '1 234 567,89 €'],
    [-25_000, '-250,00 €'],
  ])('%s centimes → %s', (centimes, attendu) => {
    expect(formaterEuros(centimes)).toBe(attendu);
  });

  it('refuse un montant qui n’est pas un nombre entier de centimes', () => {
    expect(() => formaterEuros(1.5)).toThrow(RangeError);
  });
});

describe('formaterTaux', () => {
  it.each([
    [550, '5,5 %'],
    [1000, '10 %'],
    [2000, '20 %'],
  ])('%s points de base → %s', (taux, attendu) => {
    expect(formaterTaux(taux)).toBe(attendu);
  });
});

describe('formaterDate', () => {
  it('écrit une date ISO au format français', () => {
    expect(formaterDate('2027-02-09')).toBe('09/02/2027');
  });

  it('refuse une date qui n’est pas au format ISO', () => {
    expect(() => formaterDate('9/2/2027')).toThrow(RangeError);
  });
});
