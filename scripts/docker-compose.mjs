// Lance `docker compose` depuis la racine du dépôt, pour les scripts n8n:* et smoke.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Sous Windows, buildx bake refuse de construire si la lettre du lecteur du dossier courant n'a
// pas la même casse que celle du Dockerfile (« c:\… » ouvert par VS Code contre « C:\… ») : voir
// les pièges rencontrés dans ROADMAP.md. On normalise en majuscule.
const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..').replace(
  /^[a-z]:/,
  (lecteur) => lecteur.toUpperCase(),
);

/**
 * Exécute une commande docker compose. Par défaut, la sortie s'affiche et un échec arrête le
 * script ; avec `{ capturer: true }`, la sortie standard est renvoyée.
 */
export function dockerCompose(args, { capturer = false, tolererLEchec = false } = {}) {
  const resultat = spawnSync('docker', ['compose', ...args], {
    cwd: racine,
    encoding: 'utf8',
    stdio: capturer ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (resultat.status !== 0 && !tolererLEchec) {
    console.error(`✖ docker compose ${args.join(' ')} a échoué (code ${String(resultat.status)}).`);
    process.exit(1);
  }
  return { code: resultat.status, sortie: resultat.stdout ?? '' };
}
