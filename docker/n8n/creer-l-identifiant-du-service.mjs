// Écrit les identifiants de n8n au format de `n8n import:credentials` :
// - « Service relaisMetier » : le secret partagé avec le service (en-tête x-secret-partage) ;
// - « SMTP des alertes » : le serveur qui envoie les alertes à l'administrateur.
// Les données en clair sont chiffrées par n8n à l'import, avec N8N_ENCRYPTION_KEY : aucun secret
// ne figure ni dans le dépôt, ni dans les workflows exportés.
//
// Usage : node creer-l-identifiant-du-service.mjs <fichier de sortie>
// Variables : SECRET_PARTAGE (obligatoire), SMTP_HOTE, SMTP_PORT, SMTP_UTILISATEUR,
//             SMTP_MOT_DE_PASSE, SMTP_TLS (true pour le port 465)

import { writeFileSync } from 'node:fs';

const [sortie] = process.argv.slice(2);
const secret = process.env.SECRET_PARTAGE;
if (sortie === undefined || secret === undefined || secret === '') {
  console.error('Usage : SECRET_PARTAGE=… node creer-l-identifiant-du-service.mjs <sortie>');
  process.exit(1);
}

// Identifiants fixes : les workflows versionnés y font référence.
const identifiants = [
  {
    id: 'serviceRelais001',
    name: 'Service relaisMetier',
    type: 'httpHeaderAuth',
    data: { name: 'x-secret-partage', value: secret },
  },
  {
    id: 'smtpAlertes00001',
    name: 'SMTP des alertes',
    type: 'smtp',
    // Par défaut, le serveur de test GreenMail, sans authentification.
    data: {
      host: process.env.SMTP_HOTE ?? 'greenmail',
      port: Number(process.env.SMTP_PORT ?? '3025'),
      secure: process.env.SMTP_TLS === 'true',
      user: process.env.SMTP_UTILISATEUR ?? '',
      password: process.env.SMTP_MOT_DE_PASSE ?? '',
    },
  },
];

writeFileSync(sortie, JSON.stringify(identifiants), { mode: 0o600 });
