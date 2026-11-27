import { HorlogeFixe, INSTANT_DE_REFERENCE, unInstant } from '@mailhelper/application/testing';
import { describe, expect, it } from 'vitest';

import { creerLesAlertes, type SignalementDePanne } from './alertes.js';
import {
  JournalDesAlertesEnMemoire,
  verifierLeContratDuJournalDesAlertes,
} from './testing/index.js';

verifierLeContratDuJournalDesAlertes('doublure en mémoire', () =>
  Promise.resolve(new JournalDesAlertesEnMemoire()),
);

const unePanne = (surcharges: Partial<SignalementDePanne> = {}): SignalementDePanne => ({
  workflow: 'Relever les boîtes',
  noeud: 'POST /boites/:id/relever',
  message: 'Boîte injoignable après 30012 ms',
  execution: '128',
  lien: 'http://127.0.0.1:5678/workflow/releverBoites001/executions/128',
  ...surcharges,
});

describe('signaler', () => {
  it('prépare le courriel de la première alerte, avec la panne et le lien vers n8n', async () => {
    const alertes = creerLesAlertes({
      journal: new JournalDesAlertesEnMemoire(),
      horloge: new HorlogeFixe(),
      a: 'admin@exemple.test',
      de: 'alertes@exemple.test',
    });

    const alerte = await alertes.signaler(unePanne());

    expect(alerte).toMatchObject({
      envoyer: true,
      a: 'admin@exemple.test',
      de: 'alertes@exemple.test',
      occurrences: 1,
      cause: 'Relever les boîtes / POST /boites/:id/relever : Boîte injoignable après # ms',
      objet: '[relaisMetier] Échec du workflow « Relever les boîtes »',
    });
    expect(alerte.corps).toContain('Message : Boîte injoignable après 30012 ms');
    expect(alerte.corps).toContain('Exécution : 128');
    expect(alerte.corps).toContain(
      'Voir dans n8n : http://127.0.0.1:5678/workflow/releverBoites001/executions/128',
    );
    expect(alerte.corps).toContain('produite 1 fois');
  });

  it('n’en renvoie pas pour la même cause dans l’heure, même si les détails changent', async () => {
    const alertes = creerLesAlertes({
      journal: new JournalDesAlertesEnMemoire(),
      horloge: new HorlogeFixe(),
      a: 'admin@exemple.test',
      de: 'alertes@exemple.test',
    });
    await alertes.signaler(unePanne());
    expect(
      await alertes.signaler(unePanne({ message: 'Boîte injoignable après 30470 ms' })),
    ).toMatchObject({
      envoyer: false,
      occurrences: 2,
    });
  });

  it('écrit une panne sans nœud, exécution ni lien', async () => {
    const horloge = new HorlogeFixe(unInstant(INSTANT_DE_REFERENCE));
    const alertes = creerLesAlertes({
      journal: new JournalDesAlertesEnMemoire(),
      horloge,
      a: 'admin@exemple.test',
      de: 'alertes@exemple.test',
    });
    const { corps } = await alertes.signaler(
      unePanne({ noeud: null, execution: null, lien: null }),
    );
    expect(corps).toContain('Nœud : (aucun)');
    expect(corps).not.toContain('Exécution');
    expect(corps).not.toContain('Voir dans n8n');
  });
});
