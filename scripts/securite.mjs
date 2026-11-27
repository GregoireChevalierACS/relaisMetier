// Analyse CodeQL locale, la même que celle de la CI (ADR 0006) : à lancer avant de pousser, pour
// que les alertes de sécurité ne se découvrent pas seulement sur GitHub.
//
// Usage : pnpm securite
// Variables : CODEQL (chemin de l'exécutable, sinon ~/.codeql/<version>/codeql/codeql)

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Doit rester la version épinglée dans .github/workflows/codeql.yml. */
export const VERSION_DE_CODEQL = '2.27.6';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const executable =
  process.env.CODEQL ??
  join(
    homedir(),
    '.codeql',
    VERSION_DE_CODEQL,
    'codeql',
    process.platform === 'win32' ? 'codeql.exe' : 'codeql',
  );
// Base hors du dépôt : elle pèse plusieurs centaines de Mo et se recrée à chaque analyse.
const base = join(tmpdir(), 'relaismetier-codeql');
const sarif = join(base, 'resultats.sarif');

function codeql(args) {
  const resultat = spawnSync(executable, args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (resultat.error?.code === 'ENOENT') {
    console.error(
      `✖ CodeQL ${VERSION_DE_CODEQL} introuvable (${executable}). Installation : voir docs/adr/0006-analyse-codeql-locale.md.`,
    );
    process.exit(1);
  }
  if (resultat.status !== 0) {
    console.error(
      `✖ codeql ${args[0] ?? ''} ${args[1] ?? ''} a échoué (code ${String(resultat.status)}).`,
    );
    process.exit(1);
  }
}

console.log(`Analyse CodeQL ${VERSION_DE_CODEQL} (security-and-quality)…`);
codeql([
  'database',
  'create',
  base,
  '--language=javascript-typescript',
  `--source-root=${racine}`,
  `--codescanning-config=${join(racine, '.github/codeql/codeql-config.yml')}`,
  '--overwrite',
  '--quiet',
]);
codeql([
  'database',
  'analyze',
  base,
  '--format=sarif-latest',
  `--output=${sarif}`,
  '--threads=0',
  '--quiet',
]);

const resultats = JSON.parse(readFileSync(sarif, 'utf8')).runs.flatMap((run) => run.results ?? []);
for (const { ruleId, level, message, locations } of resultats) {
  const lieu = locations?.[0]?.physicalLocation;
  const fichier = lieu?.artifactLocation?.uri ?? '?';
  console.error(
    `✖ ${relative(racine, join(racine, fichier))}:${String(lieu?.region?.startLine ?? '?')} [${level ?? 'note'}] ${ruleId} — ${message.text}`,
  );
}
console.log(
  resultats.length === 0
    ? '✔ Aucune alerte CodeQL.'
    : `${String(resultats.length)} alerte(s) CodeQL : à corriger avant de pousser.`,
);
process.exitCode = resultats.length === 0 ? 0 : 1;
