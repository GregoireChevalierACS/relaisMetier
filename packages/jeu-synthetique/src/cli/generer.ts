// Écrit le jeu synthétique sur le disque.
//
// Usage : pnpm generer:jeu [--graine 42] [--sortie donnees-synthetiques]

import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

import { FICHIER_DU_MANIFESTE, genererLeJeu, GRAINE_PAR_DEFAUT, REPARTITION } from '../index.js';
import { DOSSIER_PAR_DEFAUT, resoudre } from './dossier.js';

const { values } = parseArgs({
  options: {
    graine: { type: 'string', default: String(GRAINE_PAR_DEFAUT) },
    sortie: { type: 'string', default: DOSSIER_PAR_DEFAUT },
  },
});

const graine = Number(values.graine);
if (!Number.isSafeInteger(graine) || graine < 0) {
  console.error(`Graine invalide : ${values.graine} (entier positif attendu).`);
  process.exit(1);
}
const sortie = resoudre(values.sortie);

// On ne vide qu'un dossier déjà produit par ce générateur, reconnaissable à son manifeste.
if (existsSync(sortie) && (await readdir(sortie)).length > 0) {
  if (!existsSync(join(sortie, FICHIER_DU_MANIFESTE))) {
    console.error(
      `${sortie} n'est pas vide et ne contient pas de ${FICHIER_DU_MANIFESTE} : abandon.`,
    );
    process.exit(1);
  }
  await rm(sortie, { recursive: true });
}

const { fichiers, manifeste } = await genererLeJeu(graine);
for (const { chemin, contenu } of fichiers) {
  const cible = join(sortie, chemin);
  await mkdir(dirname(cible), { recursive: true });
  await writeFile(cible, contenu);
}

console.log(
  `Jeu synthétique (graine ${String(graine)}) écrit dans ${sortie} : ${String(fichiers.length)} fichiers.`,
);
console.log(`- ${String(manifeste.courriels.length)} courriels :`);
for (const [categorie, nombre] of Object.entries(REPARTITION))
  console.log(`    ${categorie} : ${String(nombre)}`);
console.log(`- ${String(manifeste.devis.length)} devis PDF, dont une mise en page modifiée`);
console.log(`- 2 exports Excel (devis signés, contrats d'entretien)`);
console.log(`- les attendus et les empreintes dans ${FICHIER_DU_MANIFESTE}`);
