import { describe, expect, it } from 'vitest';

import {
  alerteDue,
  causeDeLaPanne,
  INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES,
  LONGUEUR_MAXIMALE_D_UNE_CAUSE,
} from './Alerte.js';

describe('causeDeLaPanne', () => {
  const panne = (message: string, noeud: string | null = 'POST /boites/:id/relever') =>
    causeDeLaPanne({ workflow: 'Relever les boîtes', noeud, message });

  it('réunit le workflow, le nœud et le message', () => {
    expect(panne('Boîte injoignable')).toBe(
      'Relever les boîtes / POST /boites/:id/relever : Boîte injoignable',
    );
  });

  it('donne la même cause à deux échecs qui ne diffèrent que par des nombres ou des identifiants', () => {
    expect(panne('Délai dépassé après 30012 ms')).toBe(panne('Délai dépassé après 30470 ms'));
    expect(panne('Exécution 3f2b1c9e-0a4d-4e5f-8a6b-7c8d9e0f1a2b en échec')).toBe(
      panne('Exécution 11111111-2222-3333-4444-555555555555 en échec'),
    );
  });

  it('remplace chaque nombre par « # » et chaque identifiant par « … »', () => {
    expect(panne('Délai de 30012 ms, essai 2')).toBe(
      'Relever les boîtes / POST /boites/:id/relever : Délai de # ms, essai #',
    );
    expect(panne('Exécution 3f2b1c9e-0a4d-4e5f-8a6b-7c8d9e0f1a2b en échec')).toBe(
      'Relever les boîtes / POST /boites/:id/relever : Exécution … en échec',
    );
  });

  it('distingue deux nœuds ou deux messages différents', () => {
    expect(panne('Boîte injoignable')).not.toBe(panne('Boîte injoignable', 'GET /boites'));
    expect(panne('Boîte injoignable')).not.toBe(panne('Secret refusé'));
  });

  it('nomme le workflow quand l’échec ne vient d’aucun nœud précis', () => {
    expect(panne('Arrêt', null)).toBe('Relever les boîtes / workflow : Arrêt');
  });

  it('ramasse les espaces et borne la longueur', () => {
    expect(panne('  Boîte\n\n  injoignable  ')).toMatch(/ : Boîte injoignable$/);
    expect(panne('x'.repeat(500))).toHaveLength(LONGUEUR_MAXIMALE_D_UNE_CAUSE);
  });
});

describe('alerteDue', () => {
  const MAINTENANT = 1_793_437_200_000;

  it('est due pour une cause jamais signalée', () => {
    expect(alerteDue(null, MAINTENANT)).toBe(true);
  });

  it('ne l’est pas dans l’heure qui suit la dernière alerte', () => {
    expect(
      alerteDue(MAINTENANT - INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES + 1, MAINTENANT),
    ).toBe(false);
  });

  it('l’est de nouveau une heure après, pile', () => {
    expect(alerteDue(MAINTENANT - INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES, MAINTENANT)).toBe(
      true,
    );
  });
});
