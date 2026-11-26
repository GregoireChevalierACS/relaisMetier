// Exporte tous les workflows de n8n dans n8n/workflows/, un fichier par workflow (nommé par son
// identifiant). À lancer après chaque modification faite dans l'interface, avant de committer.
//
// Usage : pnpm n8n:exporter

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { dockerCompose } from './docker-compose.mjs';

const DOSSIER = 'n8n/workflows';

// Champs propres à une instance : dates, versions, projet propriétaire. Ils changeraient à chaque
// export sans que le workflow change, et le projet n'existe pas dans un n8n neuf.
const CHAMPS_DE_L_INSTANCE = [
  // L'activation dépend de l'instance : ce qui doit tourner est listé dans n8n/publies.json.
  'active',
  'createdAt',
  'updatedAt',
  'versionId',
  'activeVersionId',
  'versionCounter',
  'triggerCount',
  'shared',
];

// --backup = --all --pretty --separate : un JSON par workflow.
dockerCompose(['run', '--rm', 'n8n-cli', 'export:workflow', '--backup', `--output=/workflows/`]);

for (const fichier of readdirSync(DOSSIER).filter((nom) => nom.endsWith('.json'))) {
  const chemin = join(DOSSIER, fichier);
  const workflow = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(chemin, 'utf8'))).filter(
      ([champ]) => !CHAMPS_DE_L_INSTANCE.includes(champ),
    ),
  );
  writeFileSync(chemin, `${JSON.stringify(workflow, null, 2)}\n`);
}
console.log(`✔ Workflows exportés et nettoyés dans ${DOSSIER}/.`);
