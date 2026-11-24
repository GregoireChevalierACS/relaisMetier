import { createHash, timingSafeEqual } from 'node:crypto';

/** En-tête porteur du secret partagé entre n8n et le service. */
export const EN_TETE_DU_SECRET = 'x-secret-partage';

const empreinte = (texte: string): Buffer => createHash('sha256').update(texte).digest();

/**
 * Compare en temps constant. Les empreintes ont toujours la même longueur : la durée de la
 * comparaison ne révèle ni le contenu ni la longueur du secret attendu.
 */
export function creerVerificateurDeSecret(
  secretAttendu: string,
): (recu: string | undefined) => boolean {
  const attendu = empreinte(secretAttendu);
  return (recu) => recu !== undefined && timingSafeEqual(empreinte(recu), attendu);
}
