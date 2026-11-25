import {
  BoiteEnMemoire,
  boiteEnPanne,
  DepositaireEnMemoire,
  HorlogeFixe,
  INSTANT_DE_REFERENCE,
  unCourriel,
} from '@mailhelper/application/testing';
import type { BoiteDeReception } from '@mailhelper/application';
import { creerLesCasDUsageDesBoites, type BoiteGeree } from '@relaismetier/application';
import { describe, expect, it, vi } from 'vitest';

import { creerLApplication } from './application.js';
import { EN_TETE_DU_SECRET } from './authentification.js';

const SECRET = 'secret-de-test-suffisamment-long-0123';

const uneBoite = (
  id: string,
  reception: BoiteDeReception = new BoiteEnMemoire([]),
): BoiteGeree => ({
  id,
  adresse: `${id}@atelier-thermique.test`,
  parallelisme: 2,
  reception,
  envoyes: new BoiteEnMemoire([]),
  depositaire: new DepositaireEnMemoire(),
});

/** La même application qu'en production : seules les boîtes, en mémoire, changent. */
function uneApplication(signalerUnePanne: (erreur: unknown) => void = vi.fn()) {
  const boites = creerLesCasDUsageDesBoites({
    boites: [
      uneBoite('devis', new BoiteEnMemoire([unCourriel({ recuLe: INSTANT_DE_REFERENCE })])),
      uneBoite('accueil', boiteEnPanne()),
    ],
    horloge: new HorlogeFixe(),
    signalerUnePanne,
  });
  return creerLApplication({ secretPartage: SECRET, boites, signalerUnePanne });
}

const authentifiee = (secret = SECRET): RequestInit => ({
  headers: { [EN_TETE_DU_SECRET]: secret },
});

describe('GET /sante', () => {
  it('répond 200 avec le secret partagé', async () => {
    const reponse = await uneApplication().request('/sante', authentifiee());

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ statut: 'ok' });
  });

  it.each([
    ['sans secret', {}],
    ['avec un mauvais secret', authentifiee('mauvais')],
  ])('répond 401 en Problem Details %s', async (_cas, init) => {
    const reponse = await uneApplication().request('/sante', init);

    expect(reponse.status).toBe(401);
    expect(reponse.headers.get('content-type')).toBe('application/problem+json');
    expect(await reponse.json()).toEqual({
      type: 'urn:relaismetier:probleme:non-authentifie',
      title: 'Secret partagé absent ou invalide',
      status: 401,
    });
  });
});

describe('route inconnue', () => {
  it('répond 404 en Problem Details', async () => {
    const reponse = await uneApplication().request('/inconnue', authentifiee());

    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toMatchObject({ type: 'urn:relaismetier:probleme:introuvable' });
  });

  it("ne révèle pas l'existence d'une route sans le secret", async () => {
    const reponse = await uneApplication().request('/inconnue');

    expect(reponse.status).toBe(401);
  });
});

describe('panne', () => {
  it("répond 500 sans exposer le détail, et signale l'erreur", async () => {
    const signalerUnePanne = vi.fn();
    const application = uneApplication(signalerUnePanne);
    const panne = new Error('détail interne à ne pas divulguer');
    application.get('/en-panne', () => {
      throw panne;
    });

    const reponse = await application.request('/en-panne', authentifiee());

    expect(reponse.status).toBe(500);
    expect(await reponse.text()).not.toContain('détail interne');
    expect(signalerUnePanne).toHaveBeenCalledWith(panne);
  });
});

describe('GET /boites', () => {
  it('liste les boîtes configurées, sans leurs accès', async () => {
    const reponse = await uneApplication().request('/boites', authentifiee());

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual([
      { id: 'devis', adresse: 'devis@atelier-thermique.test' },
      { id: 'accueil', adresse: 'accueil@atelier-thermique.test' },
    ]);
  });
});

describe('GET /boites/:id/connexion', () => {
  it('répond 200 avec le nombre de courriels récents', async () => {
    const reponse = await uneApplication().request('/boites/devis/connexion', authentifiee());

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ statut: 'ok', courrielsRecents: 1 });
  });

  it('répond 404 pour une boîte inconnue', async () => {
    const reponse = await uneApplication().request('/boites/inconnue/connexion', authentifiee());

    expect(reponse.status).toBe(404);
    expect(await reponse.json()).toMatchObject({
      type: 'urn:relaismetier:probleme:boite-inconnue',
    });
  });

  it('répond 502 pour une boîte injoignable, sans en exposer la cause', async () => {
    const signalerUnePanne = vi.fn();
    const reponse = await uneApplication(signalerUnePanne).request(
      '/boites/accueil/connexion',
      authentifiee(),
    );

    expect(reponse.status).toBe(502);
    const texte = await reponse.text();
    expect(texte).toContain('urn:relaismetier:probleme:boite-injoignable');
    expect(texte).not.toContain('réseau coupé');
    expect(signalerUnePanne).toHaveBeenCalledOnce();
  });
});
