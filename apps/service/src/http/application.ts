import type { CasDUsageDesBoites } from '@relaismetier/application';
import { Hono } from 'hono';

import { creerVerificateurDeSecret, EN_TETE_DU_SECRET } from './authentification.js';
import { repondreParUnProbleme } from './problemes.js';

export interface DependancesHttp {
  readonly secretPartage: string;
  readonly boites: CasDUsageDesBoites;
  /** Reçoit les pannes, dont le détail n'est jamais renvoyé à l'appelant. */
  readonly signalerUnePanne: (erreur: unknown) => void;
}

/**
 * L'application HTTP, identique en production et en test : seules ses dépendances changent.
 * Toutes les routes exigent le secret partagé, y compris /sante : le service n'est joint que par
 * n8n et par la sonde de Docker, qui le connaissent tous deux.
 */
export function creerLApplication({
  secretPartage,
  boites,
  signalerUnePanne,
}: DependancesHttp): Hono {
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

  // Les boîtes à relever : n8n en tire la liste des relevés à planifier (phase 3).
  application.get('/boites', (contexte) => contexte.json(boites.listerLesBoites()));

  application.get('/boites/:id/connexion', async (contexte) => {
    const resultat = await boites.verifierLaConnexion(contexte.req.param('id'));
    if (!resultat.ok) return repondreParUnProbleme(contexte, resultat.error.kind);
    return contexte.json({ statut: 'ok', courrielsRecents: resultat.value.courrielsRecents });
  });

  // Appelé par n8n toutes les quelques minutes, et rejoué sans effet en cas de reprise.
  application.post('/boites/:id/relever', async (contexte) => {
    const resultat = await boites.relever(contexte.req.param('id'));
    if (!resultat.ok) return repondreParUnProbleme(contexte, resultat.error.kind);
    return contexte.json(resultat.value);
  });

  application.notFound((contexte) => repondreParUnProbleme(contexte, 'introuvable'));
  application.onError((erreur, contexte) => {
    signalerUnePanne(erreur);
    return repondreParUnProbleme(contexte, 'erreur-interne');
  });

  return application;
}
