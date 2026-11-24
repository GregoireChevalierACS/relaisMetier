/**
 * Générateur pseudo-aléatoire à graine (mulberry32), repris de FindAndFill : même graine, même
 * jeu de données. Math.random() rendrait le jeu impossible à reproduire.
 */
export interface Alea {
  /** Nombre dans [0, 1[. */
  suivant(): number;
  /** Entier dans [min, max], bornes incluses. */
  entier(min: number, max: number): number;
  choisir<T>(liste: readonly T[]): T;
  /** Les éléments de la liste dans un ordre mélangé (la liste d'origine est intacte). */
  melanger<T>(liste: readonly T[]): T[];
}

export function creerAlea(graine: number): Alea {
  let etat = graine >>> 0;

  function suivant(): number {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function entier(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError(`Bornes invalides : [${String(min)}, ${String(max)}].`);
    }
    return min + Math.floor(suivant() * (max - min + 1));
  }

  function choisir<T>(liste: readonly T[]): T {
    // Index tiré sans passer par entier() : une liste vide donne l'index 0, donc undefined.
    const element = liste[Math.floor(suivant() * liste.length)];
    if (element === undefined) throw new RangeError('Impossible de choisir dans une liste vide.');
    return element;
  }

  function melanger<T>(liste: readonly T[]): T[] {
    // Tirage sans remise : on retire un élément au hasard de ce qui reste, jusqu'à épuisement.
    const reste = [...liste];
    const resultat: T[] = [];
    while (reste.length > 0) {
      resultat.push(...reste.splice(entier(0, reste.length - 1), 1));
    }
    return resultat;
  }

  return { suivant, entier, choisir, melanger };
}
