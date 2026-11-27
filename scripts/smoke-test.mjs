// Smoke test de bout en bout : démarre la pile, importe et publie les workflows versionnés dans
// n8n, puis vérifie, à travers n8n et le service :
// - « Vérifier le service » : GET /sante avec le secret partagé ;
// - chaque boîte configurée est joignable en IMAP ;
// - « Relever les boîtes » : un relevé par boîte, rejoué sans effet (idempotence) ;
// - « Alerter l'administrateur » : un courriel par cause, pas de second dans l'heure.
//
// Usage : pnpm smoke [--arreter]
//   --arreter : supprime les conteneurs et les volumes à la fin (CI).

import { dockerCompose } from './docker-compose.mjs';
import { importerEtPublier } from './n8n-publication.mjs';

const arreter = process.argv.includes('--arreter');

// Le smoke test ne consomme jamais d'appels payants : sa pile tourne sans clé d'API (la variable
// du shell l'emporte sur .env), et le tri doit répondre « désactivé ». Le vrai tri est mesuré par
// l'évaluation (pnpm evaluer), lancée sciemment.
process.env.ANTHROPIC_API_KEY = '';

function echouer(message) {
  console.error(`✖ ${message}`);
  if (arreter) dockerCompose(['down', '--volumes'], { tolererLEchec: true });
  process.exit(1);
}

/** Exécute un workflow par la CLI n8n et renvoie les sorties (JSON) de chaque nœud. */
function executer(workflow) {
  const { sortie } = dockerCompose(
    ['run', '--rm', '--no-deps', 'n8n-cli', 'execute', `--id=${workflow}`, '--rawOutput'],
    { capturer: true, tolererLEchec: true },
  );
  // La CLI mêle ses journaux au JSON de l'exécution, avant comme après selon les machines (le
  // « task runner » s'annonce parfois à la fin). On ne garde que le bloc JSON, écrit indenté : de
  // la première ligne qui commence par « { » à la première qui commence par « } ».
  const lignes = sortie.split('\n');
  const debut = lignes.findIndex((ligne) => ligne.startsWith('{'));
  const fin = lignes.findIndex((ligne, index) => index > debut && ligne.startsWith('}'));
  if (debut === -1 || fin === -1) echouer(`sortie de n8n execute inattendue :\n${sortie}`);
  const execution = JSON.parse(lignes.slice(debut, fin + 1).join('\n'));
  if (execution.status !== 'success') {
    echouer(
      `le workflow ${workflow} a échoué : ${JSON.stringify(execution.data?.resultData?.error?.message)}`,
    );
  }
  const sorties = (noeud) =>
    (execution.data?.resultData?.runData?.[noeud]?.[0]?.data?.main?.[0] ?? []).map(
      ({ json }) => json,
    );
  return sorties;
}

/**
 * Appelle une route du service depuis son propre conteneur (il n'est joignable que sur le réseau
 * interne), avec le secret partagé qu'il connaît déjà.
 */
function appelerLeService(chemin) {
  const script = `fetch('http://localhost:3000${chemin}', { headers: { 'x-secret-partage': process.env.SECRET_PARTAGE } }).then(async (r) => { console.log(JSON.stringify({ statut: r.status, corps: await r.json() })); })`;
  const { sortie } = dockerCompose(['exec', '-T', 'service', 'node', '-e', script], {
    capturer: true,
  });
  return JSON.parse(sortie);
}

dockerCompose(['up', '--detach', '--build', '--wait']);

// Le service ne doit être joignable que sur le réseau Docker interne.
const conteneurs = dockerCompose(['ps', '--format', 'json', 'service'], { capturer: true });
const publies = conteneurs.sortie
  .split('\n')
  .filter(Boolean)
  .flatMap((ligne) => JSON.parse(ligne).Publishers ?? [])
  .filter((publication) => publication.PublishedPort !== 0);
if (publies.length > 0) echouer(`le service publie un port : ${JSON.stringify(publies)}`);
console.log('✔ Le service ne publie aucun port.');

importerEtPublier();

const [sante] = executer('verifierService1')('GET /sante');
if (sante?.statut !== 'ok') echouer(`GET /sante a répondu ${JSON.stringify(sante)}`);
console.log(
  `✔ Le workflow « Vérifier le service » a appelé GET /sante : ${JSON.stringify(sante)}.`,
);

// Chaque boîte configurée doit être joignable par l'adapter IMAP de mailHelper.
const boites = appelerLeService('/boites');
if (boites.statut !== 200 || boites.corps.length === 0) {
  echouer(`GET /boites a répondu ${JSON.stringify(boites)}`);
}
for (const { id } of boites.corps) {
  const connexion = appelerLeService(`/boites/${id}/connexion`);
  if (connexion.statut !== 200) {
    echouer(`la boîte ${id} est injoignable : ${JSON.stringify(connexion)}`);
  }
  console.log(`✔ Boîte ${id} joignable en IMAP : ${JSON.stringify(connexion.corps)}.`);
}

// Deux relevés de suite : le second ne doit rien inscrire de nouveau.
const premiereExecution = executer('releverBoites001');
const premier = premiereExecution('POST /boites/:id/relever');
const second = executer('releverBoites001')('POST /boites/:id/relever');
if (premier.length !== boites.corps.length) {
  echouer(`relevé de ${String(premier.length)} boîte(s) au lieu de ${String(boites.corps.length)}`);
}
const relevesEnDouble = second.filter(
  (compteRendu, index) =>
    compteRendu.nouveaux !== 0 || compteRendu.dejaConnus !== premier[index]?.lus,
);
if (relevesEnDouble.length > 0) {
  echouer(`le second relevé a réinscrit des courriels : ${JSON.stringify(second)}`);
}
console.log(
  `✔ Le workflow « Relever les boîtes » est idempotent : ${JSON.stringify(premier)}, puis ${String(second.reduce((total, { nouveaux }) => total + nouveaux, 0))} nouveau.`,
);

// Après chaque relevé, le tri est appelé pour chaque boîte, et se dit désactivé sans clé.
const tris = premiereExecution('POST /boites/:id/trier');
if (tris.length !== boites.corps.length || tris.some(({ desactive }) => desactive !== true)) {
  echouer(`le tri aurait dû être appelé et désactivé pour chaque boîte : ${JSON.stringify(tris)}`);
}
console.log(
  `✔ Le workflow appelle le tri après chaque relevé : désactivé sans clé d'API (${String(tris.length)} boîtes).`,
);

// Workflow d'erreur : une alerte par cause et par heure. Le lancement manuel injecte un échec
// d'exemple. Sur une base neuve, la première exécution envoie le courriel ; la seconde, jamais.
const alerter = () => executer('alerterAdmin001');
const premiere = alerter();
const [decision] = premiere('POST /alertes');
if (decision?.envoyer === true) {
  const [envoi] = premiere("Courriel à l'administrateur");
  if (!envoi?.accepted?.includes(decision.a)) {
    echouer(`le courriel d'alerte n'a pas été accepté : ${JSON.stringify(envoi)}`);
  }
}
const [repetee] = alerter()('POST /alertes');
if (repetee?.envoyer !== false) {
  echouer(`une seconde alerte de même cause dans l'heure : ${JSON.stringify(repetee)}`);
}
console.log(
  `✔ Le workflow d'erreur envoie au plus une alerte par cause et par heure (${decision?.envoyer === true ? 'courriel accepté par le serveur SMTP, ' : ''}seconde alerte retenue).`,
);

if (arreter) dockerCompose(['down', '--volumes']);
