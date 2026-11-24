import { defineProject } from 'vitest/config';

// Les paquets des sous-modules exposent leurs sources sous la condition « source » : les tests
// les lisent directement, sans build préalable.
const conditionsSource = { conditions: ['source'] };

export default defineProject({
  resolve: conditionsSource,
  ssr: { resolve: conditionsSource },
  test: { name: 'service', include: ['src/**/*.test.ts'] },
});
