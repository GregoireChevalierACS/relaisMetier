import { z } from 'zod';

import { ConfigurationInvalide } from './configuration.js';

/** Une boîte partagée, telle que décrite dans le fichier des boîtes, avec son mot de passe. */
export interface ConfigurationDeBoite {
  readonly id: string;
  readonly adresse: string;
  /** Nom affiché comme expéditeur des brouillons. */
  readonly nom: string;
  readonly parallelisme: number;
  readonly imap: {
    readonly hote: string;
    readonly port: number;
    readonly securise: boolean;
    readonly utilisateur: string;
    readonly motDePasse: string;
  };
}

export const FICHIER_DES_BOITES_PAR_DEFAUT = 'config/boites.json';

/** « devis-2 » → BOITE_DEVIS_2_MOT_DE_PASSE. */
export const variableDuMotDePasse = (id: string): string =>
  `BOITE_${id.toUpperCase().replace(/-/g, '_')}_MOT_DE_PASSE`;

const schemaDeBoite = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, { error: 'minuscules, chiffres et - seulement' }),
  adresse: z.email({ error: 'adresse invalide' }),
  nom: z.string().min(1, { error: 'est obligatoire' }),
  parallelisme: z
    .number({ error: 'doit être un nombre' })
    .int({ error: 'doit être un entier' })
    .min(1, { error: 'doit être compris entre 1 et 10' })
    .max(10, { error: 'doit être compris entre 1 et 10' })
    .default(2),
  imap: z.strictObject({
    hote: z.string().min(1, { error: 'est obligatoire' }),
    port: z.number({ error: 'doit être un nombre' }).int().min(1).max(65535),
    securise: z.boolean({ error: 'doit valoir true ou false' }),
    utilisateur: z.string().min(1, { error: 'est obligatoire' }),
  }),
});

const schemaDesBoites = z
  .array(schemaDeBoite)
  .min(1, { error: 'doit décrire au moins une boîte' })
  .refine((boites) => new Set(boites.map(({ id }) => id)).size === boites.length, {
    error: 'contient deux boîtes avec le même identifiant',
  });

const invalide = (problemes: readonly string[]): ConfigurationInvalide =>
  new ConfigurationInvalide(
    `Configuration des boîtes invalide :\n${problemes.map((p) => `- ${p}`).join('\n')}`,
  );

/**
 * Lit le fichier des boîtes (versionné, sans secret) et le mot de passe de chacune dans
 * l'environnement. Comme pour le reste de la configuration, un message d'erreur nomme ce qui
 * manque, jamais une valeur reçue.
 */
export function lireLesBoites(
  env: Readonly<Record<string, string | undefined>>,
  lireUnFichier: (chemin: string) => string,
): ConfigurationDeBoite[] {
  const chemin = env['FICHIER_DES_BOITES'] ?? FICHIER_DES_BOITES_PAR_DEFAUT;
  let contenu: unknown;
  try {
    contenu = JSON.parse(lireUnFichier(chemin));
  } catch {
    throw invalide([`${chemin} est illisible ou n'est pas du JSON`]);
  }

  const lu = schemaDesBoites.safeParse(contenu);
  if (!lu.success) {
    throw invalide(
      lu.error.issues.map(({ path, message }) => `${['boites', ...path].join('.')} ${message}`),
    );
  }

  const boites = lu.data.map((boite) => ({
    ...boite,
    imap: { ...boite.imap, motDePasse: env[variableDuMotDePasse(boite.id)] ?? '' },
  }));
  const sansMotDePasse = boites.filter(({ imap }) => imap.motDePasse === '');
  if (sansMotDePasse.length > 0) {
    throw invalide(sansMotDePasse.map(({ id }) => `${variableDuMotDePasse(id)} est obligatoire`));
  }
  return boites;
}
