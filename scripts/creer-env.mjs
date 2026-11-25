// Crée .env à partir de .env.example, en donnant un secret aléatoire à chaque variable vide.
// Si .env existe, il est seulement complété avec les variables apparues depuis dans le modèle :
// une valeur existante n'est jamais modifiée (elle contient peut-être la clé de chiffrement de n8n).
//
// Usage : node scripts/creer-env.mjs

import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const modele = readFileSync('.env.example', 'utf8');
// base64url : lettres, chiffres, - et _, l'alphabet exigé par le service pour SECRET_PARTAGE.
const secret = () => randomBytes(32).toString('base64url');
const env = modele.replace(/^([A-Z0-9_]+)=$/gm, (_ligne, nom) => `${nom}=${secret()}`);
const variables = (texte) => new Set([...texte.matchAll(/^([A-Z0-9_]+)=/gm)].map(([, nom]) => nom));

try {
  // Drapeau « wx » : la création échoue si .env existe. Vérifier puis écrire en deux temps
  // laisserait une fenêtre où un .env apparu entre-temps serait écrasé.
  writeFileSync('.env', env, { mode: 0o600, flag: 'wx' });
  console.log('.env créé avec des secrets aléatoires.');
} catch (erreur) {
  if (erreur?.code !== 'EEXIST') throw erreur;
  const presentes = variables(readFileSync('.env', 'utf8'));
  const manquantes = [...variables(modele)].filter((nom) => !presentes.has(nom));
  if (manquantes.length === 0) {
    console.log('.env existe déjà et est complet : rien à faire.');
  } else {
    // Ajout en fin de fichier seulement : les lignes existantes restent intactes.
    appendFileSync('.env', `\n${manquantes.map((nom) => `${nom}=${secret()}`).join('\n')}\n`);
    console.log(`.env complété : ${manquantes.join(', ')}.`);
  }
}
