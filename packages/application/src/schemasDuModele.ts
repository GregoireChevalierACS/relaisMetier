import { z } from 'zod';

/**
 * Formats de réponse imposés aux modèles (sorties structurées), puis revalidés à la réception.
 * Les descriptions sont lues par le modèle. Volontairement sans bornes de longueur : les sorties
 * structurées ne les acceptent pas toutes, et ce sont des règles du domaine.
 */
export const schemaDeTri = z.strictObject({
  reponseAttendue: z
    .boolean()
    .describe(
      "Vrai si l'expéditeur attend une réponse écrite de l'entreprise : question, demande de devis, de rendez-vous, de décision.",
    ),
  motif: z.string().describe('Une phrase qui justifie la décision.'),
});

export type Tri = z.infer<typeof schemaDeTri>;

export const schemaDeRedaction = z.strictObject({
  texte: z
    .string()
    .describe(
      'Corps complet de la réponse, prêt à relire, sans objet ni signature, avec des [emplacements] pour ce qui manque.',
    ),
});

export type Redaction = z.infer<typeof schemaDeRedaction>;
