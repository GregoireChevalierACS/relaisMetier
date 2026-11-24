import { describe, expect, it, vi } from 'vitest';

import { creerLApplication } from './application.js';
import { EN_TETE_DU_SECRET } from './authentification.js';

const SECRET = 'secret-de-test-suffisamment-long-0123';

function uneApplication(signalerUnePanne: (erreur: unknown) => void = vi.fn()) {
  return creerLApplication({ secretPartage: SECRET, signalerUnePanne });
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
