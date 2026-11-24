import { describe, expect, it } from 'vitest';

import { ajouterJours, ajouterUnAn, depuisIso, versIso } from './dates.js';

describe('dates', () => {
  it('fait l’aller-retour entre une date ISO et un instant UTC', () => {
    expect(versIso(depuisIso('2027-02-09'))).toBe('2027-02-09');
  });

  it('ajoute des jours en passant les fins de mois', () => {
    expect(ajouterJours('2027-02-26', 3)).toBe('2027-03-01');
    expect(ajouterJours('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('ajoute un an', () => {
    expect(ajouterUnAn('2026-07-14')).toBe('2027-07-14');
  });

  it('reporte le 29 février au 1er mars de l’année suivante', () => {
    expect(ajouterUnAn('2028-02-29')).toBe('2029-03-01');
  });
});
