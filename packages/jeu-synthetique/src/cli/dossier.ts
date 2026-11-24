import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dossier du jeu par défaut, à la racine du dépôt (ignoré par Git). */
export const DOSSIER_PAR_DEFAUT = fileURLToPath(
  new URL('../../../../donnees-synthetiques', import.meta.url),
);

/**
 * Un chemin relatif donné en option se lit depuis le dossier où la commande a été tapée
 * (INIT_CWD, fourni par pnpm), pas depuis le paquet où pnpm exécute le script.
 */
export const resoudre = (chemin: string): string =>
  resolve(process.env.INIT_CWD ?? process.cwd(), chemin);
