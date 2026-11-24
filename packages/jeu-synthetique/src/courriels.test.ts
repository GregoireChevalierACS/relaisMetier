import { describe, expect, it } from 'vitest';

import { creerAlea } from './alea.js';
import {
  CATEGORIES,
  genererLesCourriels,
  prochaineHeureOuvree,
  QUESTIONS,
  REPARTITION,
  type Categorie,
} from './courriels.js';
import type { Boite } from './entreprise.js';
import { genererLeModele } from './modele.js';

function unJeuDeCourriels(graine: number) {
  const alea = creerAlea(graine);
  return genererLesCourriels(alea, genererLeModele(alea));
}

const heureLocale = (instantUtc: number): number => new Date(instantUtc + 3_600_000).getUTCHours();

const BOITE_DE: Record<Categorie, Boite> = {
  'demande-de-devis': 'devis',
  injection: 'devis',
  fournisseur: 'commandes',
  'question-recurrente': 'accueil',
  'rendez-vous': 'accueil',
  robot: 'accueil',
  'lettre-d-information': 'accueil',
};

describe.each([1, 42, 2026])('genererLesCourriels (graine %i)', (graine) => {
  const courriels = unJeuDeCourriels(graine);

  it('donne 50 courriels, avec la répartition prévue', () => {
    expect(courriels).toHaveLength(50);
    for (const categorie of CATEGORIES) {
      expect(courriels.filter((c) => c.attendu.categorie === categorie)).toHaveLength(
        REPARTITION[categorie],
      );
    }
  });

  it('numérote les courriels dans l’ordre chronologique, aux heures ouvrées', () => {
    expect(courriels.map((c) => c.numero)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    const instants = courriels.map((c) => c.envoyeLe);
    expect([...instants].sort((a, b) => a - b)).toEqual(instants);
    expect(new Set(instants).size).toBe(instants.length);
    for (const instant of instants) {
      expect(heureLocale(instant)).toBeGreaterThanOrEqual(7);
      expect(heureLocale(instant)).toBeLessThan(21);
    }
  });

  it('ne contient que des adresses sous un domaine réservé .test', () => {
    for (const { de, repondreA, corps } of courriels) {
      const adresses = [
        de.adresse,
        ...(repondreA === null ? [] : [repondreA.adresse]),
        ...(corps.match(/[\w.-]+@[\w.-]+/g) ?? []),
      ];
      for (const adresse of adresses) expect(adresse).toMatch(/\.test$/);
    }
  });

  it('attend une réponse si et seulement si un destinataire est désigné', () => {
    for (const { attendu, de, repondreA } of courriels) {
      const destinataire = attendu.reponseAttendue ? (repondreA ?? de).adresse : null;
      expect(attendu.destinataireDeLaReponse).toBe(destinataire);
      if (attendu.reponseAttendue) expect(attendu.regleDeNonReponse).toBeNull();
    }
  });

  it('range chaque catégorie dans sa boîte', () => {
    for (const { boite, attendu } of courriels) {
      expect(boite).toBe(BOITE_DE[attendu.categorie]);
    }
  });

  it('pose chaque question récurrente une fois', () => {
    const questions = courriels.flatMap((c) =>
      c.attendu.question === undefined ? [] : [c.attendu.question],
    );
    expect([...questions].sort()).toEqual([...QUESTIONS].sort());
  });

  it('attend une réponse aux seules ruptures parmi les courriels de fournisseurs', () => {
    const fournisseurs = courriels.filter((c) => c.attendu.categorie === 'fournisseur');
    for (const { attendu } of fournisseurs) {
      expect(attendu.reponseAttendue).toBe(attendu.reponseFournisseur === 'rupture');
    }
    const natures = fournisseurs.map((c) => c.attendu.reponseFournisseur);
    expect(natures.filter((n) => n === 'confirme')).toHaveLength(4);
    expect(natures.filter((n) => n === 'rupture')).toHaveLength(3);
    expect(natures.filter((n) => n === 'delai')).toHaveLength(3);
  });

  it('exclut toute réponse aux robots et aux lettres d’information, par une règle de mailHelper', () => {
    const robots = courriels.filter((c) => c.attendu.categorie === 'robot');
    expect(robots.every((c) => c.attendu.regleDeNonReponse === 'adresse-sans-lecteur')).toBe(true);
    const lettres = courriels.filter((c) => c.attendu.categorie === 'lettre-d-information');
    expect(lettres.every((c) => c.attendu.regleDeNonReponse === 'diffusion-de-masse')).toBe(true);
    expect(lettres.every((c) => c.entetes.some(([nom]) => nom === 'List-Unsubscribe'))).toBe(true);
  });

  it('glisse chaque consigne injectée dans une vraie demande, qui attend une réponse au client', () => {
    const injections = courriels.filter((c) => c.attendu.categorie === 'injection');
    expect(injections).toHaveLength(4);
    for (const { attendu, corps, de } of injections) {
      expect(corps).toContain(attendu.consigneInjectee);
      expect(corps).toContain('devis');
      expect(attendu.destinataireDeLaReponse).toBe(de.adresse);
    }
  });

  it('fait répondre au Reply-To quand un client écrit depuis son travail', () => {
    const avecReplyTo = courriels.filter(
      (c) => c.attendu.categorie === 'demande-de-devis' && c.repondreA !== null,
    );
    expect(avecReplyTo).toHaveLength(2);
    for (const { de, repondreA, attendu } of avecReplyTo) {
      expect(de.adresse).toMatch(/@entreprise-cliente\.test$/);
      expect(attendu.destinataireDeLaReponse).toBe(repondreA?.adresse);
    }
  });
});

describe('genererLesCourriels', () => {
  it('signale un modèle qui n’a pas assez de correspondants', () => {
    const alea = creerAlea(1);
    const modele = genererLeModele(alea);
    const appauvri = { ...modele, correspondants: modele.correspondants.slice(0, 10) };
    expect(() => genererLesCourriels(alea, appauvri)).toThrow('Plus assez de correspondants');
  });
});

describe('prochaineHeureOuvree', () => {
  // Heures locales d'Orléans en février 2027 (UTC+1).
  const local = (jour: number, heure: number, minute = 0): number =>
    Date.UTC(2027, 1, jour, heure - 1, minute);

  it('garde un instant entre 7 h et 21 h', () => {
    expect(prochaineHeureOuvree(local(15, 7))).toBe(local(15, 7));
    expect(prochaineHeureOuvree(local(15, 20, 59))).toBe(local(15, 20, 59));
  });

  it('reporte au lendemain 7 h un envoi de 21 h ou plus, en gardant les minutes', () => {
    expect(prochaineHeureOuvree(local(15, 21, 12))).toBe(local(16, 7, 12));
    expect(prochaineHeureOuvree(local(15, 23, 40))).toBe(local(16, 7, 40));
  });

  it('reporte à 7 h le même jour un envoi d’avant 7 h', () => {
    expect(prochaineHeureOuvree(local(16, 3, 5))).toBe(local(16, 7, 5));
  });
});
