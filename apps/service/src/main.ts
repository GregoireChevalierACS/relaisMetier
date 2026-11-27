// Composition root : le seul endroit qui lit l'environnement, l'heure et le disque, et qui branche
// les adapters.
import { readFileSync } from 'node:fs';

import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import type { Horloge } from '@mailhelper/application';
import { creerInstant } from '@mailhelper/domain';
import { creerLaBoiteImap, creerLeDepositaireImap, type ConnexionImap } from '@mailhelper/imap';
import {
  creerLesAlertes,
  creerLeTri,
  creerLesCasDUsageDesBoites,
  type BoiteGeree,
  type Modeles,
} from '@relaismetier/application';
import pg from 'pg';

import { ConfigurationInvalide, lireLaConfiguration, type Configuration } from './configuration.js';
import { lireLesBoites, type ConfigurationDeBoite } from './configurationDesBoites.js';
import { creerLeJournalDesAlertesPostgres } from './database/journalDesAlertesPostgres.js';
import { creerLeJournalPostgres } from './database/journalPostgres.js';
import { migrer } from './database/migrations.js';
import { creerLApplication } from './http/application.js';
import { creerLeRedacteurClaude, creerLeTrieurClaude } from './llm/modelesClaude.js';

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

/** Les modèles Claude, ou null sans clé d'API : le service relève alors sans trier. */
function lesModeles({ claude, fichierDesReponsesFrequentes }: Configuration): Modeles | null {
  if (claude === null) {
    console.log('Tri désactivé : ANTHROPIC_API_KEY absente.');
    return null;
  }
  const client = new Anthropic({ apiKey: claude.cleDApi });
  const envoyer = (parametres: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming) =>
    client.beta.messages.create(parametres);
  return {
    trieur: creerLeTrieurClaude(envoyer, { modele: claude.modeleDeTri }),
    redacteur: creerLeRedacteurClaude(envoyer, {
      modele: claude.modeleDeRedaction,
      reponsesFrequentes: readFileSync(fichierDesReponsesFrequentes, 'utf8'),
    }),
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

  const boites = configurationDesBoites.map(versLaBoiteGeree);
  const journal = creerLeJournalPostgres(pool);
  const application = creerLApplication({
    secretPartage: configuration.secretPartage,
    boites: creerLesCasDUsageDesBoites({
      boites,
      journal,
      horloge: horlogeSysteme,
      signalerUnePanne,
    }),
    alertes: creerLesAlertes({
      journal: creerLeJournalDesAlertesPostgres(pool),
      horloge: horlogeSysteme,
      ...configuration.alertes,
    }),
    tri: creerLeTri({
      boites,
      journal,
      horloge: horlogeSysteme,
      modeles: lesModeles(configuration),
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
