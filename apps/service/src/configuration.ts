import { z } from 'zod';

export interface Configuration {
  readonly port: number;
  readonly secretPartage: string;
}

const LONGUEUR_MINIMALE_DU_SECRET = 32;

const schema = z.object({
  PORT: z.coerce
    .number({ error: 'doit être un nombre' })
    .int({ error: 'doit être un entier' })
    .min(1, { error: 'doit être compris entre 1 et 65535' })
    .max(65535, { error: 'doit être compris entre 1 et 65535' })
    .default(3000),
  // Alphabet restreint : le secret voyage dans un en-tête HTTP et dans le JSON des identifiants
  // n8n, sans échappement possible.
  SECRET_PARTAGE: z
    .string({ error: 'est obligatoire' })
    .min(LONGUEUR_MINIMALE_DU_SECRET, {
      error: `doit contenir au moins ${String(LONGUEUR_MINIMALE_DU_SECRET)} caractères`,
    })
    .regex(/^[A-Za-z0-9_-]+$/, { error: 'ne doit contenir que des lettres, chiffres, - et _' }),
});

export class ConfigurationInvalide extends Error {
  override readonly name = 'ConfigurationInvalide';
}

/**
 * Lit et valide la configuration au démarrage. Le message d'erreur nomme les variables fautives,
 * jamais la valeur reçue : elle pourrait être un secret.
 */
export function lireLaConfiguration(
  env: Readonly<Record<string, string | undefined>>,
): Configuration {
  const resultat = schema.safeParse(env);
  if (!resultat.success) {
    const problemes = resultat.error.issues.map(
      (probleme) => `- ${probleme.path.join('.')} ${probleme.message}`,
    );
    throw new ConfigurationInvalide(`Configuration invalide :\n${problemes.join('\n')}`);
  }
  return { port: resultat.data.PORT, secretPartage: resultat.data.SECRET_PARTAGE };
}
