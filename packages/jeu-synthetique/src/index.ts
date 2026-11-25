// API publique du jeu synthétique. Réservée aux tests, à l'évaluation et aux scripts : le code
// livré ne l'importe jamais (règle production-independante-des-tests).
export {
  CATEGORIES,
  QUESTIONS,
  REPARTITION,
  REPONSES_FOURNISSEUR,
  type AttenduDeCourriel,
  type Categorie,
  type Question,
  type RegleDeNonReponse,
  type ReponseFournisseur,
} from './courriels.js';
export { BOITES, DOMAINE, FOURNISSEURS, type Boite, type CodeFournisseur } from './entreprise.js';
export {
  CHEMINS,
  FICHIER_DU_MANIFESTE,
  genererLeJeu,
  GRAINE_PAR_DEFAUT,
  type CourrielAttendu,
  type DevisAttendu,
  type EnvoiAttendu,
  type FichierGenere,
  type Jeu,
  type Manifeste,
} from './jeu.js';
export type { Aide, ContratDEntretien, Devis, DevisSigne, LigneDeDevis } from './modele.js';
export type { Personne } from './personnes.js';
