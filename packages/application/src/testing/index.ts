// Doublures et contrats de la couche application : réservés aux tests (règle
// production-independante-des-tests).
export {
  unTraitement,
  verifierLeContratDuJournal,
  type FabriqueDeJournal,
} from './contratDuJournal.js';
export { JournalEnMemoire, journalEnPanne } from './journalEnMemoire.js';
export { RedacteurScripte, TrieurScripte } from './modeles.js';
export { JournalDesAlertesEnMemoire, verifierLeContratDuJournalDesAlertes } from './alertes.js';
