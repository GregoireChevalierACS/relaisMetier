import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';
import { CHANTIER_CHAUDIERE } from './chantiers.js';
import { ajouterUnAn, JOUR_DE_REFERENCE } from './dates.js';
import {
  genererLeModele,
  NOMBRE_DE_CONTRATS,
  NOMBRE_DE_CORRESPONDANTS,
  NOMBRE_DE_DEVIS,
} from './modele.js';

const GRAINES = [1, 42, 2026, 123_456];

describe.each(GRAINES)('genererLeModele (graine %i)', (graine) => {
  const modele = genererLeModele(creerAlea(graine));

  it('donne les effectifs prévus', () => {
    expect(modele.devis).toHaveLength(NOMBRE_DE_DEVIS);
    expect(modele.contrats).toHaveLength(NOMBRE_DE_CONTRATS);
    expect(modele.correspondants).toHaveLength(NOMBRE_DE_CORRESPONDANTS);
  });

  it('ne donne jamais deux rôles à la même personne', () => {
    const personnes = [
      ...modele.devis.map((d) => d.client),
      ...modele.contrats.map((c) => c.client),
      ...modele.correspondants,
    ];
    expect(new Set(personnes.map((p) => p.courriel)).size).toBe(personnes.length);
  });

  it('chiffre chaque devis avec des totaux cohérents, en centimes entiers', () => {
    for (const devis of modele.devis) {
      for (const ligne of devis.lignes) {
        expect(ligne.totalHt).toBe(ligne.quantite * ligne.prixUnitaireHt);
      }
      expect(devis.totalHt).toBe(devis.lignes.reduce((somme, ligne) => somme + ligne.totalHt, 0));
      expect(devis.totalTtc).toBe(devis.totalHt + devis.totalTva);
      const aides = devis.aides.reduce((somme, aide) => somme + aide.montant, 0);
      expect(devis.resteACharge).toBe(devis.totalTtc - aides);
      // Les aides ne couvrent jamais plus de la moitié du devis.
      expect(aides).toBeLessThanOrEqual(devis.totalTtc / 2);
      expect(Number.isSafeInteger(devis.totalTva)).toBe(true);
    }
  });

  it('numérote et date les devis dans l’ordre, avant le jour de référence', () => {
    expect(modele.devis.map((d) => d.numero)).toEqual(
      Array.from({ length: NOMBRE_DE_DEVIS }, (_, i) => `D-2027-000${String(i + 1)}`),
    );
    const dates = modele.devis.map((d) => d.date);
    expect([...dates].sort()).toEqual(dates);
    expect(dates.every((date) => date < JOUR_DE_REFERENCE)).toBe(true);
  });

  it('commence par un remplacement de chaudière signé, qui touche deux fournisseurs', () => {
    const [premier] = modele.devis;
    expect(premier?.chantier).toBe(CHANTIER_CHAUDIERE.code);
    const fournisseurs = premier?.lignes.flatMap((l) =>
      l.fournisseur === null ? [] : [l.fournisseur],
    );
    expect(new Set(fournisseurs).size).toBe(2);
    expect(modele.devisSignes[0]?.numero).toBe(premier?.numero);
  });

  it('fait signer un devis sur deux, après son envoi et avant le jour de référence', () => {
    expect(modele.devisSignes.map((s) => s.numero)).toEqual(
      modele.devis.filter((_, index) => index % 2 === 0).map((d) => d.numero),
    );
    for (const signe of modele.devisSignes) {
      const devis = modele.devis.find((d) => d.numero === signe.numero);
      expect(signe.dateDeSignature > (devis?.date ?? '')).toBe(true);
      expect(signe.dateDeSignature < JOUR_DE_REFERENCE).toBe(true);
    }
  });

  it('étale les échéances des contrats sur les douze mois, un an après la dernière visite', () => {
    expect(new Set(modele.contrats.map((c) => c.echeance.slice(5, 7))).size).toBe(12);
    for (const contrat of modele.contrats) {
      expect(contrat.echeance).toBe(ajouterUnAn(contrat.derniereVisite));
      expect(contrat.derniereVisite.startsWith('2026-')).toBe(true);
    }
  });
});
