import type {
  CasDUsageDesAlertes,
  CasDUsageDesBoites,
  CasDUsageDuTri,
} from '@relaismetier/application';
import { Hono } from 'hono';
import { z } from 'zod';

import { creerVerificateurDeSecret, EN_TETE_DU_SECRET } from './authentification.js';
import { repondreParUnProbleme } from './problemes.js';

export interface DependancesHttp {
  readonly secretPartage: string;
  readonly boites: CasDUsageDesBoites;
  readonly tri: CasDUsageDuTri;
  readonly alertes: CasDUsageDesAlertes;
  /** Reçoit les pannes, dont le détail n'est jamais renvoyé à l'appelant. */
  readonly signalerUnePanne: (erreur: unknown) => void;
}

/**
 * L'application HTTP, identique en production et en test : seules ses dépendances changent.
 * Toutes les routes exigent le secret partagé, y compris /sante : le service n'est joint que par
 * n8n et par la sonde de Docker, qui le connaissent tous deux.
 */
// Ce que le workflow d'erreur de n8n transmet : validé à l'entrée, jamais cru (400 sinon).
const schemaDuSignalement = z.strictObject({
  workflow: z.string().min(1).max(200),
  noeud: z.string().max(200).nullable(),
  message: z.string().max(4000),
  execution: z.string().max(100).nullable(),
  lien: z.string().max(500).nullable(),
});

export function creerLApplication({
  secretPartage,
  boites,
  tri,
  alertes,
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

  // Appelé par n8n après chaque relevé : trie les courriels réservés et dépose les brouillons.
  application.post('/boites/:id/trier', async (contexte) => {
    const resultat = await tri.trier(contexte.req.param('id'));
    if (!resultat.ok) return repondreParUnProbleme(contexte, resultat.error.kind);
    return contexte.json(resultat.value);
  });

  // Appelé par le workflow d'erreur de n8n : le service dit si l'alerte est due, n8n l'envoie.
  application.post('/alertes', async (contexte) => {
    const corps: unknown = await contexte.req.json().catch(() => null);
    const signalement = schemaDuSignalement.safeParse(corps);
    if (!signalement.success) return repondreParUnProbleme(contexte, 'requete-invalide');
    return contexte.json(await alertes.signaler(signalement.data));
  });

  application.notFound((contexte) => repondreParUnProbleme(contexte, 'introuvable'));
  application.onError((erreur, contexte) => {
    signalerUnePanne(erreur);
    return repondreParUnProbleme(contexte, 'erreur-interne');
  });

  return application;
}
