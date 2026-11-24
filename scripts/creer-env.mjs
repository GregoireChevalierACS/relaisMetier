// Crée .env à partir de .env.example, en donnant un secret aléatoire à chaque variable vide.
// Ne touche jamais un .env existant : il contient peut-être la clé de chiffrement de n8n.
//
// Usage : node scripts/creer-env.mjs

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const modele = readFileSync('.env.example', 'utf8');
// base64url : lettres, chiffres, - et _, l'alphabet exigé par le service pour SECRET_PARTAGE.
const env = modele.replace(
  /^([A-Z0-9_]+)=$/gm,
  (_ligne, nom) => `${nom}=${randomBytes(32).toString('base64url')}`,
);

try {
  // Drapeau « wx » : la création échoue si .env existe. Vérifier puis écrire en deux temps
  // laisserait une fenêtre où un .env apparu entre-temps serait écrasé.
  writeFileSync('.env', env, { mode: 0o600, flag: 'wx' });
  console.log('.env créé avec des secrets aléatoires.');
} catch (erreur) {
  if (erreur?.code !== 'EEXIST') throw erreur;
  console.log('.env existe déjà : rien à faire.');
}
