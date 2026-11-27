// API publique du domaine. Chaque concept arrive avec la phase qui en a besoin (voir ROADMAP.md).
export {
  apresUnEchec,
  cleDeTraitement,
  etatInitial,
  tentativesDe,
  TENTATIVES_MAXIMALES,
  type CleDeTraitement,
  type EtatDeTraitement,
  type Traitement,
} from './Traitement.js';
export {
  alerteDue,
  causeDeLaPanne,
  INTERVALLE_ENTRE_DEUX_ALERTES_EN_MILLISECONDES,
  LONGUEUR_MAXIMALE_D_UNE_CAUSE,
  type PanneDeWorkflow,
} from './Alerte.js';
