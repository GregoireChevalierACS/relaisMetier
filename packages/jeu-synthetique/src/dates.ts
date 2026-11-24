// Dates calendaires au format ISO (« 2027-02-09 »), calculées en UTC pour ne dépendre ni du fuseau
// ni de l'heure d'été de la machine qui génère le jeu.

/** Le « jour » où le jeu est relevé : tous les faits du jeu lui sont antérieurs. */
export const JOUR_DE_REFERENCE = '2027-03-01';

const UN_JOUR = 86_400_000;

export const versIso = (instant: number): string => new Date(instant).toISOString().slice(0, 10);

export const depuisIso = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

export const ajouterJours = (iso: string, jours: number): string =>
  versIso(depuisIso(iso) + jours * UN_JOUR);

/** Même jour, un an plus tard (le 29 février devient le 1er mars). */
export function ajouterUnAn(iso: string): string {
  const date = new Date(depuisIso(iso));
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return versIso(date.getTime());
}
