import { z } from 'zod';

/** Accès à l'API Claude, ou null quand aucune clé n'est configurée (tri désactivé). */
export interface ConfigurationDeClaude {
  readonly cleDApi: string;
  readonly modeleDeTri: string;
  readonly modeleDeRedaction: string;
}

export interface Configuration {
  readonly port: number;
  readonly secretPartage: string;
  readonly urlDeLaBase: string;
  readonly claude: ConfigurationDeClaude | null;
  readonly fichierDesReponsesFrequentes: string;
  /** Destinataire et expéditeur des alertes envoyées quand un workflow échoue. */
  readonly alertes: { readonly a: string; readonly de: string };
}

const LONGUEUR_MINIMALE_DU_SECRET = 32;

// Modèles choisis par la feuille de route : un petit pour trier, un plus grand pour rédiger.
export const MODELE_DE_TRI_PAR_DEFAUT = 'claude-haiku-5-5';
export const MODELE_DE_REDACTION_PAR_DEFAUT = 'claude-sonnet-5-5';

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
  URL_DE_LA_BASE: z
    .string({ error: 'est obligatoire' })
    .regex(/^postgres(ql)?:\/\//, { error: 'doit être une URL postgres://' }),
  // Facultative : sans elle, le service relève les boîtes mais ne trie pas.
  ANTHROPIC_API_KEY: z.string().optional(),
  MODELE_DE_TRI: z
    .string()
    .min(1, { error: 'ne doit pas être vide' })
    .default(MODELE_DE_TRI_PAR_DEFAUT),
  MODELE_DE_REDACTION: z
    .string()
    .min(1, { error: 'ne doit pas être vide' })
    .default(MODELE_DE_REDACTION_PAR_DEFAUT),
  FICHIER_DES_REPONSES_FREQUENTES: z.string().min(1).default('config/reponses-frequentes.md'),
  ADRESSE_DE_L_ADMINISTRATEUR: z
    .email({ error: 'doit être une adresse de courriel' })
    .default('admin@atelier-thermique.test'),
  EXPEDITEUR_DES_ALERTES: z
    .email({ error: 'doit être une adresse de courriel' })
    .default('alertes@atelier-thermique.test'),
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
  const { data } = resultat;
  const cleDApi = data.ANTHROPIC_API_KEY?.trim() ?? '';
  return {
    port: data.PORT,
    secretPartage: data.SECRET_PARTAGE,
    urlDeLaBase: data.URL_DE_LA_BASE,
    claude:
      cleDApi === ''
        ? null
        : { cleDApi, modeleDeTri: data.MODELE_DE_TRI, modeleDeRedaction: data.MODELE_DE_REDACTION },
    fichierDesReponsesFrequentes: data.FICHIER_DES_REPONSES_FREQUENTES,
    alertes: { a: data.ADRESSE_DE_L_ADMINISTRATEUR, de: data.EXPEDITEUR_DES_ALERTES },
  };
}
