// Évaluation du tri (et, sur option, de la rédaction) sur les 50 courriels du jeu synthétique.
//
// Usage : pnpm evaluer [--simulation oracle|nul] [--rediger] [--limite N] [--graine 42]
//                      [--reprendre <dossier>]
//   --simulation : aucun appel à l'API (vérifie le banc lui-même).
//   --rediger    : rédige aussi les brouillons (Claude Sonnet 5.5), plus cher.
//   --limite N   : seulement les N premiers cas (pilote).
//   --reprendre  : complète une passe interrompue, sans refaire les cas déjà écrits.
//
// Une passe réelle appelle l'API Claude et est facturée : ANTHROPIC_API_KEY doit être définie
// (dans l'environnement ou dans .env à la racine du dépôt).

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import Anthropic from '@anthropic-ai/sdk';
import { genererLesCasDEvaluation } from '@relaismetier/jeu-synthetique';

import { MODELE_DE_REDACTION_PAR_DEFAUT, MODELE_DE_TRI_PAR_DEFAUT } from '../configuration.js';
import { evaluerUnCas, type EnvoyerEtMesurer, type ResultatDUnCas } from './banc.js';
import { envoiSimule, type Simulation } from './simulation.js';
import { synthetiser } from './synthese.js';

const RACINE = fileURLToPath(new URL('../../../../', import.meta.url));

const { values } = parseArgs({
  options: {
    simulation: { type: 'string' },
    rediger: { type: 'boolean', default: false },
    limite: { type: 'string' },
    graine: { type: 'string', default: '42' },
    reprendre: { type: 'string' },
  },
});

const lireLaSimulation = (valeur: string | undefined): Simulation | undefined => {
  if (valeur === undefined || valeur === 'oracle' || valeur === 'nul') return valeur;
  console.error('--simulation attend oracle ou nul.');
  return process.exit(1);
};
const simulation = lireLaSimulation(values.simulation);

if (existsSync(join(RACINE, '.env'))) process.loadEnvFile(join(RACINE, '.env'));
const cleDApi = process.env['ANTHROPIC_API_KEY']?.trim() ?? '';
if (simulation === undefined && cleDApi === '') {
  console.error(
    "ANTHROPIC_API_KEY absente : une passe réelle appelle l'API. Sans clé : --simulation oracle.",
  );
  process.exit(1);
}

const modeleDeTri = process.env['MODELE_DE_TRI'] ?? MODELE_DE_TRI_PAR_DEFAUT;
const modeleDeRedaction = process.env['MODELE_DE_REDACTION'] ?? MODELE_DE_REDACTION_PAR_DEFAUT;
const reponsesFrequentes = readFileSync(join(RACINE, 'config/reponses-frequentes.md'), 'utf8');
const tousLesCas = genererLesCasDEvaluation(Number(values.graine));
const cas = values.limite === undefined ? tousLesCas : tousLesCas.slice(0, Number(values.limite));

const mode = simulation ?? (values.rediger ? 'tri-et-redaction' : 'tri');
const dossier =
  values.reprendre === undefined
    ? join(
        RACINE,
        'reports/evaluation',
        `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode}`,
      )
    : resolve(values.reprendre);
mkdirSync(dossier, { recursive: true });
const fichierDesResultats = join(dossier, 'resultats.jsonl');

// Reprise : les cas déjà écrits ne sont ni refaits ni dupliqués.
const dejaFaits: ResultatDUnCas[] = existsSync(fichierDesResultats)
  ? readFileSync(fichierDesResultats, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((ligne) => JSON.parse(ligne) as ResultatDUnCas) // eslint-disable-line @typescript-eslint/consistent-type-assertions -- fichier écrit par ce script, juste avant
  : [];
const identifiantsFaits = new Set(dejaFaits.map(({ prompt_id }) => prompt_id));

// Le SDK réessaie les 429 et 5xx avec une attente exponentielle aléatoire.
const client = new Anthropic({ apiKey: cleDApi, maxRetries: 4 });
const envoiReel: EnvoyerEtMesurer = (parametres) => client.beta.messages.create(parametres);

console.log(
  `Évaluation ${mode} : ${String(cas.length)} cas (${String(identifiantsFaits.size)} déjà faits), tri ${modeleDeTri}${values.rediger ? `, rédaction ${modeleDeRedaction}` : ''}.`,
);
console.log(`Résultats : ${dossier}`);

const resultats = [...dejaFaits];
for (const unCas of cas) {
  if (identifiantsFaits.has(unCas.messageId)) continue;
  const resultat = await evaluerUnCas(unCas, {
    envoyer: simulation === undefined ? envoiReel : envoiSimule(unCas, simulation, modeleDeTri),
    modeleDeTri,
    modeleDeRedaction,
    reponsesFrequentes,
    rediger: values.rediger,
    maintenant: () => performance.now(),
  });
  appendFileSync(fichierDesResultats, `${JSON.stringify(resultat)}\n`);
  resultats.push(resultat);
  const note =
    resultat.status === 'erreur'
      ? `erreur : ${resultat.erreur ?? ''}`
      : resultat.grade.tri === 1
        ? 'juste'
        : 'FAUX';
  console.log(
    `  ${String(resultats.length).padStart(2)}. [${resultat.tags[0] ?? ''}] ${resultat.prompt} : ${note}`,
  );
}

const synthese = synthetiser(resultats);
writeFileSync(join(dossier, 'synthese.json'), `${JSON.stringify(synthese, null, 2)}\n`);

const pourcent = (valeur: number) => `${(valeur * 100).toFixed(1)} %`;
const dollars = (valeur: number | null) =>
  valeur === null ? 'inconnu (modèle sans prix)' : `${valeur.toFixed(4)} $`;
console.log(`
Tri : ${pourcent(synthese.tri.exactitude)} de bonnes décisions (${String(synthese.cas - synthese.enErreur)} cas notés, ${String(synthese.enErreur)} en erreur)
  précision ${pourcent(synthese.tri.precision)}, rappel ${pourcent(synthese.tri.rappel)}, spécificité ${pourcent(synthese.tri.specificite)}`);
for (const erreur of synthese.erreursDeTri) {
  console.log(
    `  ✖ [${erreur.categorie}] ${erreur.objet} : attendu ${erreur.attendu ? 'réponse' : 'pas de réponse'}, obtenu ${erreur.decision}`,
  );
}
if (values.rediger) {
  console.log(
    `Brouillons : ${String(synthese.brouillons.sains)}/${String(synthese.brouillons.rediges)} sains`,
  );
  for (const probleme of synthese.brouillons.problemes) console.log(`  ✖ ${probleme}`);
}
console.log(
  `Coût : ${dollars(synthese.coutEnDollars)} ; latence moyenne ${synthese.latenceMoyenneParCasEnSecondes.toFixed(2)} s par cas`,
);
console.log(
  `Relevé type de 30 courriels : ${dollars(synthese.releveType.coutEnDollars)}, ${synthese.releveType.secondes.toFixed(0)} s en séquence`,
);
if (synthese.modelesSubstitues > 0)
  console.log(`⚠ ${String(synthese.modelesSubstitues)} cas servis par un modèle de repli.`);
