// Charge le jeu dans les boîtes du serveur de test GreenMail : pour chaque boîte, la boîte de
// réception reçoit ses courriels, et le dossier « Sent » les devis envoyés (IMAP APPEND), avec
// leur date d'origine. Chaque dossier est vidé avant : relancer la commande redonne exactement
// le même état.
//
// Usage : pnpm jeu:charger [--dossier donnees-synthetiques]
// Variables : IMAP_HOTE (127.0.0.1), IMAP_PORT (3143)

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { ImapFlow } from 'imapflow';
import { z } from 'zod';

import { BOITES, FICHIER_DU_MANIFESTE, type Boite } from '../index.js';
import { DOSSIER_PAR_DEFAUT, resoudre } from './dossier.js';

const { values } = parseArgs({
  options: { dossier: { type: 'string', default: DOSSIER_PAR_DEFAUT } },
});
const dossier = resoudre(values.dossier);
const hote = process.env['IMAP_HOTE'] ?? '127.0.0.1';
const port = Number(process.env['IMAP_PORT'] ?? '3143');

// Seuls les champs utiles au chargement sont relus, et validés : le fichier a pu être modifié.
const NOMS_DE_BOITES = Object.keys(BOITES).filter((cle): cle is Boite => cle in BOITES);
const schemaDeMessage = z.object({ boite: z.enum(NOMS_DE_BOITES), fichier: z.string() });
const manifeste = z
  .object({ courriels: z.array(schemaDeMessage), envoyes: z.array(schemaDeMessage) })
  .parse(JSON.parse(await readFile(join(dossier, FICHIER_DU_MANIFESTE), 'utf8')));

/** Dossier des messages envoyés : « Sent », que les messageries reconnaissent comme tel. */
const ENVOYES = 'Sent';

/** Vide le dossier (créé au besoin), y dépose les messages, et renvoie le nombre obtenu. */
async function remplir(
  client: ImapFlow,
  chemin: string,
  fichiers: readonly string[],
): Promise<number> {
  if (!(await client.list()).some(({ path }) => path === chemin))
    await client.mailboxCreate(chemin);
  await client.mailboxOpen(chemin);
  await client.messageDelete('1:*');
  for (const fichier of fichiers) {
    const contenu = await readFile(join(dossier, fichier));
    const date = /^Date: (.+)$/m.exec(contenu.toString())?.[1] ?? 0;
    await client.append(chemin, contenu, [], new Date(date));
  }
  // status() renvoie false quand le serveur ne répond pas : compté comme un dossier vide.
  const statut = await client.status(chemin, { messages: true });
  return statut === false ? 0 : (statut.messages ?? 0);
}

/**
 * Connexion à la boîte, en réessayant pendant au plus 30 secondes : juste après son démarrage,
 * GreenMail ne répond pas encore en IMAP. Il tourne sans authentification : le compte est créé à
 * la première connexion.
 */
async function connecter(adresse: string): Promise<ImapFlow> {
  for (let tentative = 1; ; tentative += 1) {
    const client = new ImapFlow({
      host: hote,
      port,
      secure: false,
      auth: { user: adresse, pass: 'jeu' },
      logger: false,
    });
    try {
      await client.connect();
      return client;
    } catch (erreur) {
      if (tentative >= 30) throw erreur;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

let echecs = 0;
for (const boite of NOMS_DE_BOITES) {
  const adresse = BOITES[boite];
  const fichiersDe = (messages: readonly z.infer<typeof schemaDeMessage>[]) =>
    messages.filter((message) => message.boite === boite).map(({ fichier }) => fichier);
  const recus = fichiersDe(manifeste.courriels);
  const envoyes = fichiersDe(manifeste.envoyes);

  const client = await connecter(adresse);
  try {
    const dansLaReception = await remplir(client, 'INBOX', recus);
    const dansLesEnvoyes = await remplir(client, ENVOYES, envoyes);
    const conforme = dansLaReception === recus.length && dansLesEnvoyes === envoyes.length;
    if (!conforme) echecs += 1;
    console.log(
      `${conforme ? '✔' : '✖'} ${adresse} : ${String(dansLaReception)}/${String(recus.length)} reçus, ${String(dansLesEnvoyes)}/${String(envoyes.length)} envoyés.`,
    );
  } finally {
    await client.logout();
  }
}
process.exitCode = echecs === 0 ? 0 : 1;
