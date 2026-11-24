import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'jeu-synthetique', include: ['src/**/*.test.ts'] },
});
