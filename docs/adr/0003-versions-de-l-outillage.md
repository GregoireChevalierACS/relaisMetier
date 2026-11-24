# 0003 — Versions de l'outillage

- **Date :** 2026-11-24
- **Statut :** acceptée

## Contexte

L'outillage reprend celui de mailHelper et slideshowBuilder, déjà éprouvé, avec les mêmes contraintes de compatibilité entre TypeScript, typescript-eslint, Vitest et Stryker. S'y ajoutent des images Docker, dont n8n, qui change souvent.

## Décision

- **Node 24 LTS**, épinglé dans `.node-version` (lu par la CI), dans l'image du service (`node:24.22.1-alpine`) et exigé par `engines` avec `engine-strict=true`.
- **pnpm 10.34** épinglé par `packageManager`. Versions exactes (`save-exact=true`) et lockfile figé en CI.
- **TypeScript 6.0.x** : typescript-eslint 8 n'accepte pas TypeScript 7. Dependabot ignore `typescript >=6.1.0`.
- **Vitest 5.1 et Stryker 10.1** : Stryker 10.0 n'activait pas les mutants sous Vitest 5 (voir mailHelper, ADR 0003) ; FindAndFill utilise déjà le couple Vitest 5 et Stryker 10.1. Le domaine étant vide en phase 0, **à vérifier avec le premier concept métier** : un mutant volontairement non testé doit survivre.
- **Hono 4** et **@hono/node-server 2** pour le HTTP, **zod 4** pour la validation, **tsdown** pour produire un seul fichier livré.
- **Images Docker épinglées par version** : `n8nio/n8n:2.48.7`, `postgres:18.7-alpine`, `greenmail/standalone:2.1.15`. Jamais `latest`.
- **Quarantaine de 3 jours** (`minimumReleaseAge: 4320`), appliquée aussi aux images : n8n 2.48.8, sortie la veille, a été écartée au profit de la 2.48.7.
- **Scripts d'installation bloqués** sauf celui d'esbuild (`onlyBuiltDependencies`).

## Alternatives écartées

- **n8n 1.x** : encore maintenue, mais la branche 2 est la version stable courante.
- **PostgreSQL 19** : sortie trop récente pour une base qu'on ne veut pas migrer pendant le projet.
- **Mailpit** comme serveur de test : il ne fait pas d'IMAP. GreenMail fait SMTP et IMAP.

## Conséquences

- ✅ Lint typé complet, test de mutation fonctionnel, builds reproductibles.
- ❌ À réviser ensemble : TypeScript 7 (dès que typescript-eslint le supporte), puis la sortie de mailHelper de Vitest 4.
- ❌ Chaque montée de n8n se relit avec ses notes de version : elle peut changer le format des workflows exportés. La CI le vérifie en réimportant chaque workflow dans un n8n neuf.
