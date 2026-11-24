import type { Alea } from './alea.js';

// Prénoms, noms et rues courants, combinés au hasard : aucune personne réelle n'est visée.
const PRENOMS_F = [
  'Marie',
  'Nathalie',
  'Isabelle',
  'Sophie',
  'Claire',
  'Camille',
  'Léa',
  'Anne',
  'Hélène',
  'Céline',
];
const PRENOMS_M = [
  'Jean',
  'Philippe',
  'Nicolas',
  'Laurent',
  'Pierre',
  'François',
  'Julien',
  'Michel',
  'Éric',
  'Antoine',
];
const NOMS = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Richard',
  'Petit',
  'Durand',
  'Leroux',
  'Moreau',
  'Simon',
  'Laurent',
  'Lefèvre',
  'Michel',
  'Garcia',
  'Roux',
  'Fournier',
  'Girard',
  'Bonnet',
  'Mercier',
];
const RUES = [
  'rue des Lilas',
  'avenue de la Gare',
  'chemin des Vignes',
  'rue du Moulin',
  'allée des Tilleuls',
  'rue Pasteur',
  'impasse des Acacias',
  'route de Blois',
  'rue de la Fontaine',
  'place du Marché',
];
const COMMUNES = [
  ['45000', 'Orléans'],
  ['45100', 'Orléans'],
  ['45140', 'Saint-Jean-de-la-Ruelle'],
  ['45160', 'Olivet'],
  ['45400', 'Fleury-les-Aubrais'],
  ['45800', 'Saint-Jean-de-Braye'],
  ['45650', 'Saint-Jean-le-Blanc'],
  ['45430', 'Chécy'],
] as const;

export type Civilite = 'M.' | 'Mme';

export interface Personne {
  readonly civilite: Civilite;
  readonly prenom: string;
  readonly nom: string;
  readonly courriel: string;
  readonly telephone: string;
  readonly adresse: { readonly rue: string; readonly codePostal: string; readonly commune: string };
}

/** « Hélène » → « helene » : partie locale d'adresse sans accent ni espace. */
function enAscii(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}

const deuxChiffres = (n: number): string => String(n).padStart(2, '0');

/**
 * Tire des personnes toutes distinctes (prénom et nom), pour qu'un courriel ne puisse pas être
 * attribué au mauvais client par homonymie.
 */
export function tirerDesPersonnes(alea: Alea, nombre: number): Personne[] {
  // Au-delà, la boucle ne trouverait plus de combinaison inédite et ne s'arrêterait jamais.
  const combinaisons = (PRENOMS_F.length + PRENOMS_M.length) * NOMS.length;
  if (nombre > combinaisons) {
    throw new RangeError(
      `Au plus ${String(combinaisons)} personnes distinctes, ${String(nombre)} demandées.`,
    );
  }
  const personnes: Personne[] = [];
  const vus = new Set<string>();
  while (personnes.length < nombre) {
    const civilite: Civilite = alea.choisir(['M.', 'Mme']);
    const prenom = alea.choisir(civilite === 'Mme' ? PRENOMS_F : PRENOMS_M);
    const nom = alea.choisir(NOMS);
    const cle = `${prenom} ${nom}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const [codePostal, commune] = alea.choisir(COMMUNES);
    personnes.push({
      civilite,
      prenom,
      nom,
      courriel: `${enAscii(prenom)}.${enAscii(nom)}@${alea.choisir(['exemple.test', 'courriel.test', 'messagerie.test'])}`,
      telephone: `01 99 00 ${deuxChiffres(alea.entier(0, 99))} ${deuxChiffres(alea.entier(0, 99))}`,
      adresse: { rue: `${String(alea.entier(1, 120))} ${alea.choisir(RUES)}`, codePostal, commune },
    });
  }
  return personnes;
}
