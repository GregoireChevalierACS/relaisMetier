import {
  BoiteEnMemoire,
  boiteEnPanne,
  DepositaireEnMemoire,
  HorlogeFixe,
  INSTANT_DE_REFERENCE,
  UNE_HEURE,
  unCourriel,
} from '@mailhelper/application/testing';
import { describe, expect, it, vi } from 'vitest';

import { creerLesCasDUsageDesBoites, LIMITE_DE_VERIFICATION, type BoiteGeree } from './boites.js';

const uneBoite = (surcharges: Partial<BoiteGeree> = {}): BoiteGeree => ({
  id: 'devis',
  adresse: 'devis@atelier-thermique.test',
  parallelisme: 2,
  reception: new BoiteEnMemoire([]),
  envoyes: new BoiteEnMemoire([]),
  depositaire: new DepositaireEnMemoire(),
  ...surcharges,
});

function lesCasDUsage(boites: readonly BoiteGeree[], signalerUnePanne = vi.fn()) {
  return creerLesCasDUsageDesBoites({ boites, horloge: new HorlogeFixe(), signalerUnePanne });
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
