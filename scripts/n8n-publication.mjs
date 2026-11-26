// Import et publication des workflows versionnés, partagés par pnpm n8n:importer et pnpm smoke.

import { readFileSync } from 'node:fs';

import { dockerCompose } from './docker-compose.mjs';

/**
 * Workflows à activer après import : ceux qui ont un déclencheur (planification, webhook). Un
 * import laisse tout workflow inactif ; cette liste, versionnée, dit lesquels doivent tourner.
 */
export const WORKFLOWS_PUBLIES = JSON.parse(
  readFileSync(new URL('../n8n/publies.json', import.meta.url), 'utf8'),
);

export function importerEtPublier() {
  dockerCompose(['run', '--rm', 'n8n-cli', 'import:workflow', '--separate', '--input=/workflows']);
  for (const id of WORKFLOWS_PUBLIES) {
    dockerCompose(['run', '--rm', 'n8n-cli', 'publish:workflow', `--id=${id}`]);
  }
  // n8n ne prend en compte une publication faite en ligne de commande qu'à son démarrage.
  const enCours = dockerCompose(['ps', '--quiet', 'n8n'], { capturer: true }).sortie.trim();
  if (enCours !== '' && WORKFLOWS_PUBLIES.length > 0) {
    dockerCompose(['restart', 'n8n']);
    dockerCompose(['up', '--detach', '--wait', 'n8n']);
  }
}
