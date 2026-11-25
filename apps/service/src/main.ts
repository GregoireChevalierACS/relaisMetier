// Composition root : le seul endroit qui lit l'environnement, l'heure et le disque, et qui branche
// les adapters.
import { readFileSync } from 'node:fs';

import { serve } from '@hono/node-server';
import type { Horloge } from '@mailhelper/application';
import { creerInstant } from '@mailhelper/domain';
import { creerLaBoiteImap, creerLeDepositaireImap, type ConnexionImap } from '@mailhelper/imap';
import { creerLesCasDUsageDesBoites, type BoiteGeree } from '@relaismetier/application';

import { ConfigurationInvalide, lireLaConfiguration } from './configuration.js';
import { lireLesBoites, type ConfigurationDeBoite } from './configurationDesBoites.js';
import { creerLApplication } from './http/application.js';

const horlogeSysteme: Horloge = {
  maintenant() {
    const instant = creerInstant(Date.now());
    if (!instant.ok) throw new Error('Horloge système hors de l’époque Unix.');
    return instant.value;
  },
};

function versLaBoiteGeree({
  id,
  adresse,
  nom,
  parallelisme,
  imap,
}: ConfigurationDeBoite): BoiteGeree {
  const connexion: ConnexionImap = imap;
  return {
    id,
    adresse,
    parallelisme,
    reception: creerLaBoiteImap({ connexion, dossier: 'reception' }),
    envoyes: creerLaBoiteImap({ connexion, dossier: 'envoyes' }),
    depositaire: creerLeDepositaireImap({ connexion, expediteur: { nom, adresse } }),
  };
}

function demarrer(): void {
  const configuration = lireLaConfiguration(process.env);
  const configurationDesBoites = lireLesBoites(process.env, (chemin) =>
    readFileSync(chemin, 'utf8'),
  );
  const signalerUnePanne = (erreur: unknown): void => {
    console.error('Panne pendant le traitement d’une requête :', erreur);
  };

  const application = creerLApplication({
    secretPartage: configuration.secretPartage,
    boites: creerLesCasDUsageDesBoites({
      boites: configurationDesBoites.map(versLaBoiteGeree),
      horloge: horlogeSysteme,
      signalerUnePanne,
    }),
    signalerUnePanne,
  });

  const serveur = serve({ fetch: application.fetch, port: configuration.port }, ({ port }) => {
    console.log(
      `Service à l'écoute sur le port ${String(port)}, ${String(configurationDesBoites.length)} boîte(s) : ${configurationDesBoites.map(({ id }) => id).join(', ')}.`,
    );
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
