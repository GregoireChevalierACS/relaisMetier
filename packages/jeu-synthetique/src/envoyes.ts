import { BOITES, ENTREPRISE } from './entreprise.js';
import { dateRfc5322, encoderEnMots, formaterAdresse } from './eml.js';
import { formaterDate } from './format.js';
import type { Devis } from './modele.js';

// Messages du dossier « Envoyés » de la boîte devis@ : l'envoi de chaque devis à son client, PDF
// joint. C'est la source des relances (phase 5) : un message envoyé avec un devis joint ouvre
// une séquence.

/** Heure d'envoi des devis : 10 h, heure d'Orléans (UTC+1 en hiver). */
const HEURE_D_ENVOI_UTC = 9;

/** Base64 en lignes de 76 caractères (RFC 2045, 6.8). */
const enBase64 = (contenu: Buffer): string[] => contenu.toString('base64').match(/.{1,76}/g) ?? [];

export const messageIdDEnvoi = (graine: number, numero: string): string =>
  `<jeu-${String(graine)}-envoi-${numero}@jeu.relaismetier.test>`;

export const instantDEnvoi = (devis: Devis): number =>
  Date.parse(`${devis.date}T0${String(HEURE_D_ENVOI_UTC)}:00:00Z`);

/**
 * Le message envoyé au client, en multipart/mixed. La frontière est fixe (dérivée du numéro) :
 * le même devis donne toujours les mêmes octets.
 */
export function versEmlDEnvoi(graine: number, devis: Devis, pdf: Buffer): Buffer {
  const frontiere = `=_relaismetier_${devis.numero}`;
  const { client } = devis;
  const corps = [
    `Bonjour ${client.civilite === 'Mme' ? 'Madame' : 'Monsieur'} ${client.nom},`,
    '',
    `Veuillez trouver ci-joint notre devis ${devis.numero} du ${formaterDate(devis.date)} :`,
    `${devis.objet}.`,
    '',
    `Il est valable ${String(devis.validiteJours)} jours. N'hésitez pas à nous contacter pour toute question.`,
    '',
    'Cordialement,',
    ENTREPRISE.nom,
    ENTREPRISE.telephone,
  ];
  const fichier = `${devis.numero}.pdf`;
  const lignes = [
    `Message-ID: ${messageIdDEnvoi(graine, devis.numero)}`,
    `Date: ${dateRfc5322(instantDEnvoi(devis))}`,
    `From: ${formaterAdresse({ nom: ENTREPRISE.nom, adresse: BOITES.devis })}`,
    `To: ${formaterAdresse({ nom: `${client.prenom} ${client.nom}`, adresse: client.courriel })}`,
    `Subject: ${encoderEnMots(`Votre devis ${devis.numero}`)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${frontiere}"`,
    '',
    `--${frontiere}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    ...corps,
    `--${frontiere}`,
    `Content-Type: application/pdf; name="${fichier}"`,
    `Content-Disposition: attachment; filename="${fichier}"`,
    'Content-Transfer-Encoding: base64',
    '',
    ...enBase64(pdf),
    `--${frontiere}--`,
  ];
  return Buffer.from(`${lignes.join('\r\n')}\r\n`);
}
