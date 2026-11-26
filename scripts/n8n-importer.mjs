// Importe dans n8n tous les workflows versionnés de n8n/workflows/, puis publie (active) ceux que
// liste n8n/publies.json. Un workflow qui existe déjà (même identifiant) est remplacé : le dépôt
// fait foi.
//
// Usage : pnpm n8n:importer

import { importerEtPublier } from './n8n-publication.mjs';

importerEtPublier();
