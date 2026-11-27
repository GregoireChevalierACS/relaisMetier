import {
  LONGUEUR_MAXIMALE_ANALYSEE,
  texteAAnalyser,
  type Correspondant,
  type Courriel,
} from '@mailhelper/domain';

const enLigne = (correspondant: Correspondant): string =>
  correspondant.nom === null
    ? correspondant.adresse
    : `${correspondant.nom} <${correspondant.adresse}>`;

/**
 * Un courriel qui fermerait lui-même la balise pourrait se faire passer pour la fin des données
 * et glisser une consigne : toute balise courriel ou corps du texte est neutralisée.
 */
export const neutraliserLesBalises = (texte: string): string =>
  // Chaque occurrence, ouvrante ou fermante, perd son « < » au profit d'un « ‹ » inoffensif.
  texte.replace(/<(\/?(?:courriel|corps)\b)/giu, '‹$1');

/**
 * Le courriel tel que le modèle le lit : encadré dans des balises qu'il ne peut pas fermer, et
 * présenté comme une donnée. Même présentation que l'analyseur de mailHelper.
 */
export function courrielPourLeModele(courriel: Courriel): string {
  const { texte, tronque } = texteAAnalyser(courriel);
  return [
    '<courriel>',
    `De : ${neutraliserLesBalises(enLigne(courriel.expediteur))}`,
    ...(courriel.repondreA === null
      ? []
      : [`Répondre à : ${neutraliserLesBalises(enLigne(courriel.repondreA))}`]),
    `Reçu le : ${new Date(courriel.recuLe).toISOString()}`,
    `Objet : ${neutraliserLesBalises(courriel.objet)}`,
    `Envoi en nombre : ${courriel.diffusionDeMasse ? 'oui' : 'non'}`,
    ...(tronque ? [`(Corps coupé après ${String(LONGUEUR_MAXIMALE_ANALYSEE)} caractères.)`] : []),
    '<corps>',
    neutraliserLesBalises(texte),
    '</corps>',
    '</courriel>',
  ].join('\n');
}
