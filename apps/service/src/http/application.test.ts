import {
  BoiteEnMemoire,
  boiteEnPanne,
  DepositaireEnMemoire,
  HorlogeFixe,
  INSTANT_DE_REFERENCE,
  unCourriel,
} from '@mailhelper/application/testing';
import type { BoiteDeReception } from '@mailhelper/application';
import {
  creerLeTri,
  creerLesCasDUsageDesBoites,
  type BoiteGeree,
  type JournalDesTraitements,
  type Modeles,
} from '@relaismetier/application';
import {
  JournalEnMemoire,
  journalEnPanne,
  RedacteurScripte,
  TrieurScripte,
} from '@relaismetier/application/testing';
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
function uneApplication(
  signalerUnePanne: (erreur: unknown) => void = vi.fn(),
  journal: JournalDesTraitements = new JournalEnMemoire(),
  modeles: Modeles | null = { trieur: new TrieurScripte(), redacteur: new RedacteurScripte() },
) {
  const gerees = [
    uneBoite('devis', new BoiteEnMemoire([unCourriel({ recuLe: INSTANT_DE_REFERENCE })])),
    uneBoite('accueil', boiteEnPanne()),
  ];
  const horloge = new HorlogeFixe();
  const boites = creerLesCasDUsageDesBoites({ boites: gerees, journal, horloge, signalerUnePanne });
  const tri = creerLeTri({ boites: gerees, journal, horloge, modeles, signalerUnePanne });
  return creerLApplication({ secretPartage: SECRET, boites, tri, signalerUnePanne });
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

describe('POST /boites/:id/relever', () => {
  it('relève la boîte et rend compte de ce qui a été fait', async () => {
    const reponse = await uneApplication().request('/boites/devis/relever', {
      method: 'POST',
      ...authentifiee(),
    });

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({
      lus: 1,
      nouveaux: 1,
      dejaConnus: 0,
      sansReponse: 0,
      aTrier: 1,
      illisibles: 0,
    });
  });

  it('ne refait rien quand n8n rejoue le même relevé', async () => {
    const application = uneApplication();
    const relever = () =>
      application.request('/boites/devis/relever', { method: 'POST', ...authentifiee() });
    await relever();
    expect(await (await relever()).json()).toMatchObject({ nouveaux: 0, dejaConnus: 1 });
  });

  it.each([
    ['inconnue', 404, 'boite-inconnue'],
    ['accueil', 502, 'boite-injoignable'],
  ])('répond en Problem Details pour la boîte %s', async (id, statut, type) => {
    const reponse = await uneApplication().request(`/boites/${id}/relever`, {
      method: 'POST',
      ...authentifiee(),
    });
    expect(reponse.status).toBe(statut);
    expect(await reponse.json()).toMatchObject({ type: `urn:relaismetier:probleme:${type}` });
  });

  it('répond 500 sans détail quand la base est injoignable', async () => {
    const signalerUnePanne = vi.fn();
    const reponse = await uneApplication(signalerUnePanne, journalEnPanne()).request(
      '/boites/devis/relever',
      {
        method: 'POST',
        ...authentifiee(),
      },
    );
    expect(reponse.status).toBe(500);
    expect(await reponse.text()).not.toContain('base injoignable');
    expect(signalerUnePanne).toHaveBeenCalledOnce();
  });

  it('n’accepte pas un relevé en GET', async () => {
    const reponse = await uneApplication().request('/boites/devis/relever', authentifiee());
    expect(reponse.status).toBe(404);
  });
});

describe('POST /boites/:id/trier', () => {
  const poster = (application: ReturnType<typeof uneApplication>, chemin: string) =>
    application.request(chemin, { method: 'POST', ...authentifiee() });

  it('trie les courriels relevés et rend compte des brouillons déposés', async () => {
    const application = uneApplication();
    await poster(application, '/boites/devis/relever');

    const reponse = await poster(application, '/boites/devis/trier');

    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({
      desactive: false,
      traites: 1,
      sansReponse: 0,
      brouillons: 1,
      aRetenter: 0,
      misDeCote: 0,
    });
  });

  it('dit que le tri est désactivé quand aucune clé d’API n’est configurée', async () => {
    const application = uneApplication(vi.fn(), new JournalEnMemoire(), null);
    const reponse = await poster(application, '/boites/devis/trier');
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ desactive: true, traites: 0 });
  });

  it('répond 404 pour une boîte inconnue', async () => {
    const reponse = await poster(uneApplication(), '/boites/inconnue/trier');
    expect(reponse.status).toBe(404);
  });
});
