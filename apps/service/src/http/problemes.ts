import type { Context } from 'hono';

// Catalogue des erreurs au format Problem Details (RFC 9457). Le `type` est stable : n8n et les
// tests s'y fient, jamais au texte du titre.
const CATALOGUE = {
  'non-authentifie': { status: 401, title: 'Secret partagé absent ou invalide' },
  'requete-invalide': { status: 400, title: 'Corps de requête invalide' },
  introuvable: { status: 404, title: 'Route inconnue' },
  'boite-inconnue': { status: 404, title: 'Boîte inconnue' },
  // 502 : la panne est chez le serveur de messagerie, pas dans le service.
  'boite-injoignable': { status: 502, title: 'Boîte injoignable' },
  'erreur-interne': { status: 500, title: 'Erreur interne' },
} as const;

export type CodeDeProbleme = keyof typeof CATALOGUE;

export function repondreParUnProbleme(contexte: Context, code: CodeDeProbleme): Response {
  const { status, title } = CATALOGUE[code];
  return contexte.body(
    JSON.stringify({ type: `urn:relaismetier:probleme:${code}`, title, status }),
    status,
    { 'Content-Type': 'application/problem+json' },
  );
}
