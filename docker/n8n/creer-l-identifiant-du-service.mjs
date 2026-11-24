// Écrit l'identifiant « Service relaisMetier » au format de `n8n import:credentials`.
// Les données en clair sont chiffrées par n8n à l'import, avec N8N_ENCRYPTION_KEY : le secret
// partagé ne figure ni dans le dépôt, ni dans les workflows exportés.
//
// Usage : node creer-l-identifiant-du-service.mjs <fichier de sortie>

import { writeFileSync } from 'node:fs';

const [sortie] = process.argv.slice(2);
const secret = process.env.SECRET_PARTAGE;
if (sortie === undefined || secret === undefined || secret === '') {
  console.error('Usage : SECRET_PARTAGE=… node creer-l-identifiant-du-service.mjs <sortie>');
  process.exit(1);
}

const identifiants = [
  {
    // Identifiant fixe : les workflows versionnés y font référence.
    id: 'serviceRelais001',
    name: 'Service relaisMetier',
    type: 'httpHeaderAuth',
    data: { name: 'x-secret-partage', value: secret },
  },
];

writeFileSync(sortie, JSON.stringify(identifiants), { mode: 0o600 });
