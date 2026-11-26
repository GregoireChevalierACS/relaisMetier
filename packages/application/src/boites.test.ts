import {
  BoiteEnMemoire,
  boiteEnPanne,
  DepositaireEnMemoire,
  HorlogeFixe,
  INSTANT_DE_REFERENCE,
  UNE_HEURE,
  unCourriel,
} from '@mailhelper/application/testing';
import type { JournalDesTraitements } from './ports.js';
import { cleDeTraitement } from '@relaismetier/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  creerLesCasDUsageDesBoites,
  FENETRE_DE_RELEVE_EN_HEURES,
  LIMITE_DE_RELEVE,
  LIMITE_DE_VERIFICATION,
  type BoiteGeree,
} from './boites.js';
import { JournalEnMemoire, journalEnPanne } from './testing/index.js';

const uneBoite = (surcharges: Partial<BoiteGeree> = {}): BoiteGeree => ({
  id: 'devis',
  adresse: 'devis@atelier-thermique.test',
  parallelisme: 2,
  reception: new BoiteEnMemoire([]),
  envoyes: new BoiteEnMemoire([]),
  depositaire: new DepositaireEnMemoire(),
  ...surcharges,
});

function lesCasDUsage(
  boites: readonly BoiteGeree[],
  signalerUnePanne = vi.fn(),
  journal: JournalDesTraitements = new JournalEnMemoire(),
) {
  return creerLesCasDUsageDesBoites({
    boites,
    journal,
    horloge: new HorlogeFixe(),
    signalerUnePanne,
  });
}

describe('listerLesBoites', () => {
  it('décrit chaque boîte par son identifiant et son adresse, sans ses accès', () => {
    const boites = [
      uneBoite(),
      uneBoite({ id: 'accueil', adresse: 'accueil@atelier-thermique.test' }),
    ];
    expect(lesCasDUsage(boites).listerLesBoites()).toEqual([
      { id: 'devis', adresse: 'devis@atelier-thermique.test' },
      { id: 'accueil', adresse: 'accueil@atelier-thermique.test' },
    ]);
  });
});

describe('verifierLaConnexion', () => {
  it('lit les courriels des dernières 24 heures, en nombre limité', async () => {
    const reception = new BoiteEnMemoire([
      unCourriel({ id: 'recent', recuLe: INSTANT_DE_REFERENCE - UNE_HEURE }),
      unCourriel({ id: 'ancien', recuLe: INSTANT_DE_REFERENCE - 30 * UNE_HEURE }),
    ]);
    const resultat = await lesCasDUsage([uneBoite({ reception })]).verifierLaConnexion('devis');

    expect(resultat).toEqual({ ok: true, value: { courrielsRecents: 1 } });
    expect(reception.criteres).toEqual([
      { depuis: INSTANT_DE_REFERENCE - 24 * UNE_HEURE, limite: LIMITE_DE_VERIFICATION },
    ]);
  });

  it('signale une boîte inconnue', async () => {
    expect(await lesCasDUsage([uneBoite()]).verifierLaConnexion('inconnue')).toEqual({
      ok: false,
      error: { kind: 'boite-inconnue' },
    });
  });

  it('signale une boîte injoignable, et transmet la cause à qui surveille', async () => {
    const signalerUnePanne = vi.fn();
    const cas = lesCasDUsage([uneBoite({ reception: boiteEnPanne() })], signalerUnePanne);

    expect(await cas.verifierLaConnexion('devis')).toEqual({
      ok: false,
      error: { kind: 'boite-injoignable' },
    });
    expect(signalerUnePanne).toHaveBeenCalledWith(new Error('réseau coupé'));
  });
});

describe('relever', () => {
  const unClient = unCourriel({ id: '7:1', recuLe: INSTANT_DE_REFERENCE - UNE_HEURE });
  const uneLettre = unCourriel({
    id: '7:2',
    recuLe: INSTANT_DE_REFERENCE - 2 * UNE_HEURE,
    diffusionDeMasse: true,
  });

  it('inscrit les nouveaux courriels, écartés par les règles ou à trier', async () => {
    const journal = new JournalEnMemoire();
    const reception = new BoiteEnMemoire([unClient, uneLettre]);
    const cas = lesCasDUsage([uneBoite({ reception })], vi.fn(), journal);

    expect(await cas.relever('devis')).toEqual({
      ok: true,
      value: { lus: 2, nouveaux: 2, dejaConnus: 0, sansReponse: 1, aTrier: 1, illisibles: 0 },
    });
    expect(await journal.lire(cleDeTraitement('devis', '7:1'))).toEqual({
      cle: 'devis/7:1',
      boite: 'devis',
      idCourriel: '7:1',
      recuLe: INSTANT_DE_REFERENCE - UNE_HEURE,
      etat: { kind: 'a-trier' },
    });
    expect((await journal.lire(cleDeTraitement('devis', '7:2')))?.etat).toMatchObject({
      kind: 'sans-reponse',
      par: 'regle',
    });
  });

  it('relit la fenêtre de relevé, en nombre limité', async () => {
    const reception = new BoiteEnMemoire([]);
    await lesCasDUsage([uneBoite({ reception })]).relever('devis');
    expect(reception.criteres).toEqual([
      {
        depuis: INSTANT_DE_REFERENCE - FENETRE_DE_RELEVE_EN_HEURES * UNE_HEURE,
        limite: LIMITE_DE_RELEVE,
      },
    ]);
  });

  it('ne réinscrit rien quand on relève deux fois : n8n peut réessayer sans effet', async () => {
    const cas = lesCasDUsage([uneBoite({ reception: new BoiteEnMemoire([unClient, uneLettre]) })]);
    await cas.relever('devis');
    expect(await cas.relever('devis')).toEqual({
      ok: true,
      value: { lus: 2, nouveaux: 0, dejaConnus: 2, sansReponse: 0, aTrier: 0, illisibles: 0 },
    });
  });

  it('compte les messages illisibles signalés par la boîte', async () => {
    const reception = new BoiteEnMemoire([unClient], 3);
    const resultat = await lesCasDUsage([uneBoite({ reception })]).relever('devis');
    expect(resultat.ok && resultat.value.illisibles).toBe(3);
  });

  it('signale une boîte inconnue ou injoignable sans toucher au journal', async () => {
    const cas = lesCasDUsage([uneBoite({ reception: boiteEnPanne() })], vi.fn(), journalEnPanne());
    expect(await cas.relever('inconnue')).toEqual({ ok: false, error: { kind: 'boite-inconnue' } });
    expect(await cas.relever('devis')).toEqual({ ok: false, error: { kind: 'boite-injoignable' } });
  });

  it('laisse remonter une panne du journal : ce n’est pas une panne de messagerie', async () => {
    const cas = lesCasDUsage(
      [uneBoite({ reception: new BoiteEnMemoire([unClient]) })],
      vi.fn(),
      journalEnPanne(),
    );
    await expect(cas.relever('devis')).rejects.toThrow('base injoignable');
  });
});
