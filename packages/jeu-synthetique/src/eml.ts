import { adresseDeLaBoite, type Adresse, type Courriel } from './courriels.js';

// Sérialisation RFC 5322 d'un courriel du jeu, écrite à la main pour maîtriser chaque octet :
// une bibliothèque d'envoi ajouterait des en-têtes datés ou aléatoires (Message-ID, boundary).

// Noms anglais imposés par la RFC, trois lettres chacun.
const JOURS = 'SunMonTueWedThuFriSat';
const MOIS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
const troisLettres = (noms: string, rang: number): string => noms.slice(rang * 3, rang * 3 + 3);

/** Longueur maximale d'une ligne, fin de ligne exclue (RFC 5322, 2.1.1). */
const LONGUEUR_MAXIMALE_D_UNE_LIGNE = 998;

/** Octets de texte encodés par mot RFC 2047 : 45 octets donnent 60 caractères base64, sous les 75 permis. */
const OCTETS_PAR_MOT_ENCODE = 45;

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/**
 * Date RFC 5322 à l'heure d'Orléans. Le jeu ne contient que des courriels de février et mars,
 * avant le passage à l'heure d'été : le décalage est toujours +0100.
 */
export function dateRfc5322(instantUtc: number): string {
  const local = new Date(instantUtc + 3_600_000);
  const jour = troisLettres(JOURS, local.getUTCDay());
  const mois = troisLettres(MOIS, local.getUTCMonth());
  const heure = `${deuxChiffres(local.getUTCHours())}:${deuxChiffres(local.getUTCMinutes())}:${deuxChiffres(local.getUTCSeconds())}`;
  return `${jour}, ${deuxChiffres(local.getUTCDate())} ${mois} ${String(local.getUTCFullYear())} ${heure} +0100`;
}

const estAscii = (texte: string): boolean => /^[\x20-\x7e]*$/.test(texte);

/**
 * Encode un texte non ASCII en mots RFC 2047 (« =?UTF-8?B?…?= »), coupés entre deux caractères
 * pour qu'aucun caractère multi-octet ne soit scindé, et repliés sur plusieurs lignes.
 */
export function encoderEnMots(texte: string): string {
  if (estAscii(texte)) return texte;
  const mots: string[] = [];
  let courant = '';
  for (const caractere of texte) {
    if (Buffer.byteLength(courant + caractere) > OCTETS_PAR_MOT_ENCODE) {
      mots.push(courant);
      courant = '';
    }
    courant += caractere;
  }
  mots.push(courant);
  return mots.map((mot) => `=?UTF-8?B?${Buffer.from(mot).toString('base64')}?=`).join('\r\n ');
}

/** « Nom <adresse> », le nom entre guillemets s'il est ASCII, encodé sinon. */
export function formaterAdresse({ nom, adresse }: Adresse): string {
  const affiche = estAscii(nom) ? `"${nom.replace(/(["\\])/g, '\\$1')}"` : encoderEnMots(nom);
  return `${affiche} <${adresse}>`;
}

/** Identifiant unique et stable d'un courriel du jeu : même graine, même Message-ID. */
export const messageId = (graine: number, courriel: Courriel): string =>
  `<jeu-${String(graine)}-${String(courriel.numero).padStart(3, '0')}@jeu.relaismetier.test>`;

export function versEml(graine: number, courriel: Courriel): Buffer {
  const repondreA =
    courriel.repondreA === null ? [] : [`Reply-To: ${formaterAdresse(courriel.repondreA)}`];
  const entetes = [
    `Message-ID: ${messageId(graine, courriel)}`,
    `Date: ${dateRfc5322(courriel.envoyeLe)}`,
    `From: ${formaterAdresse(courriel.de)}`,
    ...repondreA,
    `To: ${formaterAdresse(adresseDeLaBoite(courriel))}`,
    `Subject: ${encoderEnMots(courriel.objet)}`,
    ...courriel.entetes.map(([nom, valeur]) => `${nom}: ${valeur}`),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  const lignes = [...entetes, '', ...courriel.corps.split('\n')];
  for (const ligne of lignes) {
    if (Buffer.byteLength(ligne) > LONGUEUR_MAXIMALE_D_UNE_LIGNE) {
      throw new RangeError(
        `Ligne de plus de ${String(LONGUEUR_MAXIMALE_D_UNE_LIGNE)} octets dans le courriel ${String(courriel.numero)}.`,
      );
    }
  }
  return Buffer.from(`${lignes.join('\r\n')}\r\n`);
}
