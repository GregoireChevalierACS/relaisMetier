// Importe dans n8n tous les workflows versionnés de n8n/workflows/. Un workflow qui existe déjà
// (même identifiant) est remplacé : le dépôt fait foi.
//
// Usage : pnpm n8n:importer

import { dockerCompose } from './docker-compose.mjs';

dockerCompose(['run', '--rm', 'n8n-cli', 'import:workflow', '--separate', '--input=/workflows']);
