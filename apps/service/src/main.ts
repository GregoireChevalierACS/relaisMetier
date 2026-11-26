// Composition root : le seul endroit qui lit l'environnement, l'heure et le disque, et qui branche
// les adapters.
import { readFileSync } from 'node:fs';

import { serve } from '@hono/node-server';
import type { Horloge } from '@mailhelper/application';
import { creerInstant } from '@mailhelper/domain';
import { creerLaBoiteImap, creerLeDepositaireImap, type ConnexionImap } from '@mailhelper/imap';
import { creerLesCasDUsageDesBoites, type BoiteGeree } from '@relaismetier/application';
import pg from 'pg';

import { ConfigurationInvalide, lireLaConfiguration } from './configuration.js';
import { lireLesBoites, type ConfigurationDeBoite } from './configurationDesBoites.js';
import { creerLeJournalPostgres } from './database/journalPostgres.js';
import { migrer } from './database/migrations.js';
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

async function demarrer(): Promise<void> {
  const configuration = lireLaConfiguration(process.env);
  const configurationDesBoites = lireLesBoites(process.env, (chemin) =>
    readFileSync(chemin, 'utf8'),
  );
  // Le schéma est mis à jour avant d'accepter la moindre requête.
  const pool = new pg.Pool({ connectionString: configuration.urlDeLaBase });
  const migrations = await migrer(pool);
  if (migrations.length > 0) console.log(`Migrations appliquées : ${migrations.join(', ')}.`);

  const signalerUnePanne = (erreur: unknown): void => {
    console.error('Panne pendant le traitement d’une requête :', erreur);
  };

  const application = creerLApplication({
    secretPartage: configuration.secretPartage,
    boites: creerLesCasDUsageDesBoites({
      boites: configurationDesBoites.map(versLaBoiteGeree),
      journal: creerLeJournalPostgres(pool),
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
      void pool.end().then(() => process.exit(0));
    });
  });
}

try {
  await demarrer();
} catch (erreur) {
  if (!(erreur instanceof ConfigurationInvalide)) throw erreur;
  console.error(erreur.message);
  process.exitCode = 1;
}
