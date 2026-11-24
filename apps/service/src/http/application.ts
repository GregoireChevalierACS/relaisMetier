import { Hono } from 'hono';

import { creerVerificateurDeSecret, EN_TETE_DU_SECRET } from './authentification.js';
import { repondreParUnProbleme } from './problemes.js';

export interface DependancesHttp {
  readonly secretPartage: string;
  /** Reçoit les pannes, dont le détail n'est jamais renvoyé à l'appelant. */
  readonly signalerUnePanne: (erreur: unknown) => void;
}

/**
 * L'application HTTP, identique en production et en test : seules ses dépendances changent.
 * Toutes les routes exigent le secret partagé, y compris /sante : le service n'est joint que par
 * n8n et par la sonde de Docker, qui le connaissent tous deux.
 */
export function creerLApplication({ secretPartage, signalerUnePanne }: DependancesHttp): Hono {
  const secretValide = creerVerificateurDeSecret(secretPartage);
  const application = new Hono();

  application.use(async (contexte, suite) => {
    if (!secretValide(contexte.req.header(EN_TETE_DU_SECRET))) {
      return repondreParUnProbleme(contexte, 'non-authentifie');
    }
    await suite();
    return undefined;
  });

  application.get('/sante', (contexte) => contexte.json({ statut: 'ok' }));

  application.notFound((contexte) => repondreParUnProbleme(contexte, 'introuvable'));
  application.onError((erreur, contexte) => {
    signalerUnePanne(erreur);
    return repondreParUnProbleme(contexte, 'erreur-interne');
  });

  return application;
}
