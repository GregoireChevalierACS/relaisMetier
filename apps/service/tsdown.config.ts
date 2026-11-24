import { defineConfig } from 'tsdown';

// Un seul fichier livré : les paquets du dépôt, ceux des sous-modules (publiés en sources
// TypeScript) et les dépendances npm sont tous intégrés. L'image Docker n'a besoin que de Node.
export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  deps: { alwaysBundle: [/.*/] },
  inputOptions: { resolve: { conditionNames: ['source', 'import', 'default'] } },
  clean: true,
});
