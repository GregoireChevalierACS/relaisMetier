// Smoke test de bout en bout : démarre la pile, importe les workflows versionnés dans n8n, puis
// exécute « Vérifier le service », qui appelle GET /sante avec le secret partagé.
//
// Usage : pnpm smoke [--arreter]
//   --arreter : supprime les conteneurs et les volumes à la fin (CI).

import { dockerCompose } from './docker-compose.mjs';

const WORKFLOW = 'verifierService1';
const NOEUD = 'GET /sante';
const arreter = process.argv.includes('--arreter');

function echouer(message) {
  console.error(`✖ ${message}`);
  if (arreter) dockerCompose(['down', '--volumes'], { tolererLEchec: true });
  process.exit(1);
}

/** La CLI n8n écrit ses journaux avant le JSON de l'exécution : on ne garde que ce dernier. */
function lireLExecution(sortie) {
  const debut = sortie.search(/^\{/m);
  if (debut === -1) echouer(`sortie de n8n execute inattendue :\n${sortie}`);
  return JSON.parse(sortie.slice(debut));
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

dockerCompose(['run', '--rm', 'n8n-cli', 'import:workflow', '--separate', '--input=/workflows']);

const { sortie } = dockerCompose(
  ['run', '--rm', '--no-deps', 'n8n-cli', 'execute', `--id=${WORKFLOW}`, '--rawOutput'],
  { capturer: true, tolererLEchec: true },
);
const execution = lireLExecution(sortie);
const reponse = execution.data?.resultData?.runData?.[NOEUD]?.[0]?.data?.main?.[0]?.[0]?.json;

if (execution.status !== 'success' || reponse?.statut !== 'ok') {
  echouer(
    `le workflow ${WORKFLOW} n'a pas obtenu GET /sante → 200 (statut : ${String(execution.status)}, erreur : ${JSON.stringify(execution.data?.resultData?.error?.message)})`,
  );
}
console.log(`✔ Le workflow ${WORKFLOW} a appelé GET /sante : ${JSON.stringify(reponse)}.`);

/**
 * Appelle une route du service depuis son propre conteneur (il n'est joignable que sur le réseau
 * interne), avec le secret partagé qu'il connaît déjà.
 */
function appelerLeService(chemin) {
  const script = `fetch('http://localhost:3000${chemin}', { headers: { 'x-secret-partage': process.env.SECRET_PARTAGE } }).then(async (r) => { console.log(JSON.stringify({ statut: r.status, corps: await r.json() })); })`;
  const { sortie: brute } = dockerCompose(['exec', '-T', 'service', 'node', '-e', script], {
    capturer: true,
  });
  return JSON.parse(brute);
}

// Chaque boîte configurée doit être joignable par l'adapter IMAP de mailHelper.
const boites = appelerLeService('/boites');
if (boites.statut !== 200 || boites.corps.length === 0) {
  echouer(`GET /boites a répondu ${JSON.stringify(boites)}`);
}
for (const { id } of boites.corps) {
  const connexion = appelerLeService(`/boites/${id}/connexion`);
  if (connexion.statut !== 200)
    echouer(`la boîte ${id} est injoignable : ${JSON.stringify(connexion)}`);
  console.log(`✔ Boîte ${id} joignable en IMAP : ${JSON.stringify(connexion.corps)}.`);
}

if (arreter) dockerCompose(['down', '--volumes']);
