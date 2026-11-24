import { defineConfig } from 'vitest/config';

const TOUT = { lines: 100, branches: 100, functions: 100, statements: 100 };

export default defineConfig({
  test: {
    // Chaque paquet décrit son projet dans son propre vitest.config.ts (réutilisé par Stryker).
    // Les sous-modules de vendor/ ont leur propre CI : on ne rejoue pas leurs tests ici.
    projects: ['packages/*', 'apps/*'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      // Composition root : vérifié par le smoke test (docker compose), pas en unitaire, puisqu'il
      // ne fait que brancher des modules déjà testés.
      exclude: [
        '**/*.test.ts',
        '**/index.ts',
        '**/testing/**',
        '**/*.d.ts',
        'apps/service/src/main.ts',
      ],
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      thresholds: {
        // Rien n'échappe aux tests : domaine, cas d'usage et adapters.
        'packages/*/src/**': TOUT,
        'apps/*/src/**': TOUT,
      },
    },
  },
});
