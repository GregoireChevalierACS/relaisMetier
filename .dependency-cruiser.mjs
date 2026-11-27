// Règles d'architecture vérifiées en CI sur le graphe complet des dépendances.
// ESLint (no-restricted-imports) ne voit qu'un fichier à la fois ; ici, on voit les cycles et les
// dépendances transitives.

const TESTS = '\\.test\\.ts$|/testing/';

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'domaine-pur',
      comment:
        'Le domaine ne dépend que de lui-même : ni paquet npm, ni module Node, ni autre paquet du dépôt.',
      severity: 'error',
      // Les tests, eux, ont droit à leurs outils (vitest, fast-check).
      from: { path: '^packages/domain/src', pathNot: TESTS },
      to: { pathNot: '^packages/domain/src' },
    },
    {
      name: 'application-sans-infrastructure',
      comment:
        "La couche application ne connaît que le domaine et zod. Les adapters (IMAP, Claude, PDF, Excel, PostgreSQL, HTTP) dépendent d'elle, pas l'inverse.",
      severity: 'error',
      from: { path: '^packages/application/src', pathNot: TESTS },
      to: {
        pathNot: [
          '^packages/application/src',
          '^packages/domain/src',
          '^vendor/[^/]+/packages/(domain|application)/src',
          'node_modules/zod/',
        ],
      },
    },
    {
      name: 'api-publique-seulement',
      comment:
        "Un paquet n'importe un autre paquet du dépôt que par ses points d'entrée (index.ts, et testing/index.ts réservé aux tests), jamais par ses fichiers internes.",
      severity: 'error',
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: {
        path: '^packages/([^/]+)/src/(?!(testing/)?index\\.ts$)',
        pathNot: '^packages/$2/',
      },
    },
    {
      name: 'api-publique-des-sous-modules',
      comment:
        "mailHelper et FindAndFill ne sont consommés que par leurs points d'entrée : leurs fichiers internes peuvent changer sans prévenir.",
      severity: 'error',
      from: { path: '^(packages|apps)/' },
      to: { path: '^vendor/[^/]+/packages/[^/]+/src/(?!(testing/)?index\\.ts$)' },
    },
    {
      name: 'llm-confine',
      comment:
        "Seul l'adapter llm parle au modèle de langage. Exception : la commande d'évaluation, qui crée le client comme main.ts.",
      severity: 'error',
      from: { pathNot: '^apps/service/src/(llm/|main\\.ts$|evaluation/evaluer\\.ts$)' },
      to: { path: 'node_modules/@anthropic-ai/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'imap-confine',
      comment:
        "Seul l'adapter imap ouvre une connexion aux boîtes. Exception : la commande qui charge le jeu synthétique dans GreenMail, outil de test jamais livré.",
      severity: 'error',
      from: {
        pathNot:
          '^apps/service/src/(imap/|main\\.ts$)|^packages/jeu-synthetique/src/cli/charger\\.ts$',
      },
      to: { path: 'node_modules/imapflow/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'base-de-donnees-confinee',
      comment: "Seul l'adapter database touche PostgreSQL.",
      severity: 'error',
      from: { pathNot: '^apps/service/src/(database/|main\\.ts$)' },
      to: { path: 'node_modules/(pg|postgres)/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'pas-de-cycle',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'production-independante-des-tests',
      comment:
        'Le code livré ne doit jamais importer un fichier de test, une doublure ou le jeu synthétique.',
      severity: 'error',
      // Le jeu synthétique et le banc d'évaluation sont eux-mêmes des outils de test, jamais
      // bundlés dans le service (seul main.ts l'est) : ils l'importent librement.
      from: { pathNot: `${TESTS}|^packages/jeu-synthetique/|^apps/service/src/evaluation/` },
      to: { path: `${TESTS}|^packages/jeu-synthetique/` },
    },
    {
      name: 'production-sans-dependance-de-dev',
      severity: 'error',
      from: { path: '^(packages|apps)/[^/]+/src', pathNot: TESTS },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'pas-de-fourre-tout',
      comment:
        'Pas de fichier utils, helpers ou common : un nom vague cache une responsabilité mal définie.',
      severity: 'error',
      from: {},
      // Seulement notre code : les paquets npm nomment leurs dossiers comme ils l'entendent.
      to: { path: '/(utils?|helpers?|common|misc)(\\.ts|/)', pathNot: 'node_modules/' },
    },
    {
      name: 'pas-d-orphelin',
      comment: "Un module que personne n'importe est du code mort.",
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '\\.test\\.ts$',
          '\\.config\\.(ts|mjs)$',
          '/index\\.ts$',
          '\\.d\\.ts$',
          '/main\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|coverage|reports|\\.stryker-tmp)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      // Mêmes conditions que les tests : un paquet du dépôt se résout vers ses sources.
      conditionNames: ['source', 'import', 'types', 'default'],
      exportsFields: ['exports'],
    },
  },
};
