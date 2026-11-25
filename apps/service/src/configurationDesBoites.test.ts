import { describe, expect, it } from 'vitest';

import { ConfigurationInvalide } from './configuration.js';
import {
  FICHIER_DES_BOITES_PAR_DEFAUT,
  lireLesBoites,
  variableDuMotDePasse,
} from './configurationDesBoites.js';

const uneBoite = (surcharges: Record<string, unknown> = {}) => ({
  id: 'devis',
  adresse: 'devis@atelier-thermique.test',
  nom: 'Atelier Thermique Démo',
  parallelisme: 3,
  imap: {
    hote: 'greenmail',
    port: 3143,
    securise: false,
    utilisateur: 'devis@atelier-thermique.test',
  },
  ...surcharges,
});

const unFichier =
  (contenu: unknown) =>
  (chemin: string): string => {
    if (chemin !== 'boites.json') throw new Error(`fichier inattendu : ${chemin}`);
    return JSON.stringify(contenu);
  };

const ENV = { FICHIER_DES_BOITES: 'boites.json', BOITE_DEVIS_MOT_DE_PASSE: 'mot-de-passe' };

describe('lireLesBoites', () => {
  it('lit chaque boîte et son mot de passe', () => {
    expect(lireLesBoites(ENV, unFichier([uneBoite()]))).toEqual([
      {
        id: 'devis',
        adresse: 'devis@atelier-thermique.test',
        nom: 'Atelier Thermique Démo',
        parallelisme: 3,
        imap: {
          hote: 'greenmail',
          port: 3143,
          securise: false,
          utilisateur: 'devis@atelier-thermique.test',
          motDePasse: 'mot-de-passe',
        },
      },
    ]);
  });

  it('traite deux courriels à la fois par défaut', () => {
    const sansParallelisme = { ...uneBoite(), parallelisme: undefined };
    expect(lireLesBoites(ENV, unFichier([sansParallelisme]))[0]?.parallelisme).toBe(2);
  });

  it('lit config/boites.json quand aucun fichier n’est indiqué', () => {
    const lus: string[] = [];
    const lire = (chemin: string) => {
      lus.push(chemin);
      return JSON.stringify([uneBoite()]);
    };
    lireLesBoites({ BOITE_DEVIS_MOT_DE_PASSE: 'x' }, lire);
    expect(lus).toEqual([FICHIER_DES_BOITES_PAR_DEFAUT]);
  });

  it('nomme la variable du mot de passe d’après l’identifiant', () => {
    expect(variableDuMotDePasse('devis-2')).toBe('BOITE_DEVIS_2_MOT_DE_PASSE');
  });

  it.each([
    [
      'fichier absent',
      () => {
        throw new Error('ENOENT');
      },
      'boites.json est illisible',
    ],
    ['JSON invalide', () => '{', 'boites.json est illisible'],
  ])('refuse un %s', (_cas, lire, message) => {
    expect(() => lireLesBoites(ENV, lire)).toThrow(ConfigurationInvalide);
    expect(() => lireLesBoites(ENV, lire)).toThrow(message);
  });

  it.each([
    ['liste vide', [], 'doit décrire au moins une boîte'],
    ['identifiant en majuscules', [uneBoite({ id: 'Devis' })], 'boites.0.id minuscules'],
    ['adresse invalide', [uneBoite({ adresse: 'devis' })], 'boites.0.adresse adresse invalide'],
    ['parallélisme trop grand', [uneBoite({ parallelisme: 11 })], 'entre 1 et 10'],
    ['parallélisme décimal', [uneBoite({ parallelisme: 1.5 })], 'doit être un entier'],
    [
      'port texte',
      [uneBoite({ imap: { ...uneBoite().imap, port: '993' } })],
      'boites.0.imap.port doit être un nombre',
    ],
    ['champ inconnu', [uneBoite({ motDePasse: 'en clair' })], 'boites.0'],
    ['identifiants en double', [uneBoite(), uneBoite()], 'même identifiant'],
  ])('refuse une %s', (_cas, boites, message) => {
    expect(() => lireLesBoites(ENV, unFichier(boites))).toThrow(message);
  });

  it('exige le mot de passe de chaque boîte, sans jamais afficher de valeur', () => {
    const boites = [
      uneBoite(),
      uneBoite({ id: 'accueil', adresse: 'accueil@atelier-thermique.test' }),
    ];
    expect(() =>
      lireLesBoites({ ...ENV, BOITE_ACCUEIL_MOT_DE_PASSE: '' }, unFichier(boites)),
    ).toThrow(/BOITE_ACCUEIL_MOT_DE_PASSE est obligatoire$/);
    expect(() => lireLesBoites(ENV, unFichier(boites))).not.toThrow('mot-de-passe');
  });
});
