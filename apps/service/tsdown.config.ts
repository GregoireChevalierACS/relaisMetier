import { defineConfig } from 'tsdown';

// Un seul fichier livré : les paquets du dépôt, ceux des sous-modules (publiés en sources
// TypeScript) et les dépendances npm sont tous intégrés. L'image Docker n'a besoin que de Node.
export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: { alwaysBundle: [/.*/] },
  // « source » : les paquets du dépôt et des sous-modules, lus en TypeScript. Pas de condition
  // « import » : elle ferait servir à un require() CommonJS (pg → pg-pool) la variante ESM d'un
  // paquet, qui n'exporte pas la même chose (voir les pièges dans ROADMAP.md).
  inputOptions: { resolve: { conditionNames: ['source', 'node', 'default'] } },
  clean: true,
});
