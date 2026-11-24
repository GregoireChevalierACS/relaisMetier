// Composition root : le seul endroit qui lit l'environnement et branche les adapters.
import { serve } from '@hono/node-server';

import { ConfigurationInvalide, lireLaConfiguration } from './configuration.js';
import { creerLApplication } from './http/application.js';

function demarrer(): void {
  const configuration = lireLaConfiguration(process.env);
  const application = creerLApplication({
    secretPartage: configuration.secretPartage,
    signalerUnePanne: (erreur) => {
      console.error('Panne pendant le traitement d’une requête :', erreur);
    },
  });

  const serveur = serve({ fetch: application.fetch, port: configuration.port }, ({ port }) => {
    console.log(`Service à l'écoute sur le port ${String(port)}.`);
  });

  // docker compose stop envoie SIGTERM : on termine les requêtes en cours avant de sortir.
  process.once('SIGTERM', () => {
    serveur.close(() => {
      process.exit(0);
    });
  });
}

try {
  demarrer();
} catch (erreur) {
  if (!(erreur instanceof ConfigurationInvalide)) throw erreur;
  console.error(erreur.message);
  process.exitCode = 1;
}
