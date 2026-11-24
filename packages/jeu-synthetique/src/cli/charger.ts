// Charge les courriels du jeu dans les boîtes du serveur de test GreenMail : chaque boîte est
// vidée, puis reçoit ses courriels dans sa boîte de réception (IMAP APPEND), avec leur date
// d'origine. Relancer la commande redonne exactement le même état.
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
const schema = z.object({
  courriels: z.array(z.object({ boite: z.enum(NOMS_DE_BOITES), fichier: z.string() })),
});
const manifeste = schema.parse(
  JSON.parse(await readFile(join(dossier, FICHIER_DU_MANIFESTE), 'utf8')),
);

let echecs = 0;
for (const boite of NOMS_DE_BOITES) {
  const adresse = BOITES[boite];
  const courriels = manifeste.courriels.filter((courriel) => courriel.boite === boite);
  // GreenMail tourne sans authentification : le compte est créé à la première connexion.
  const client = new ImapFlow({
    host: hote,
    port,
    secure: false,
    auth: { user: adresse, pass: 'jeu' },
    logger: false,
  });
  await client.connect();
  try {
    await client.mailboxOpen('INBOX');
    await client.messageDelete('1:*');
    for (const courriel of courriels) {
      const contenu = await readFile(join(dossier, courriel.fichier));
      await client.append(
        'INBOX',
        contenu,
        [],
        new Date(/^Date: (.+)$/m.exec(contenu.toString())?.[1] ?? 0),
      );
    }
    // status() renvoie false quand le serveur ne répond pas : compté comme une boîte vide.
    const statut = await client.status('INBOX', { messages: true });
    const messages = statut === false ? 0 : (statut.messages ?? 0);
    const conforme = messages === courriels.length;
    if (!conforme) echecs += 1;
    console.log(
      `${conforme ? '✔' : '✖'} ${adresse} : ${String(messages)}/${String(courriels.length)} courriels.`,
    );
  } finally {
    await client.logout();
  }
}
process.exitCode = echecs === 0 ? 0 : 1;
