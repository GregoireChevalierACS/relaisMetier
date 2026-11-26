# 0004 — Journal des traitements dans PostgreSQL, migrations écrites à la main

- **Date :** 2026-11-26
- **Statut :** acceptée

## Contexte

n8n relève chaque boîte toutes les 5 minutes et réessaie en cas d'échec. Deux relevés peuvent donc se chevaucher, et un même courriel être lu plusieurs fois. Chaque courriel ne doit pourtant être traité qu'une fois : un seul tri, un seul brouillon. Il faut un état durable, partagé, et sûr face à des écritures simultanées.

## Décision

- **Un journal des traitements dans PostgreSQL** (base `relais`, rôle `relais`, déjà créés en phase 0), derrière le port `JournalDesTraitements` de la couche application.
- **La clé d'idempotence vient des faits** : `boîte/UIDVALIDITY:UID` (`cleDeTraitement` dans le domaine). L'unicité est garantie par la clé primaire et une seule instruction `INSERT … ON CONFLICT DO NOTHING RETURNING` : deux relevés simultanés ne peuvent pas inscrire deux fois le même courriel.
- **Le stock est relu par zod**, jamais transtypé : une ligne modifiée à la main est une panne (`StockCorrompu`), pas une donnée crue. Des contraintes `CHECK` refusent déjà à l'écriture un état incohérent.
- **Le même contrat pour la doublure en mémoire et PostgreSQL** (`verifierLeContratDuJournal`), y compris l'inscription simultanée. Les tests PostgreSQL tournent contre un vrai serveur : la base jetable de Compose en local (profil `tests`), un service Docker en CI. Chaque test travaille dans son propre schéma.
- **Le pilote `pg`**, mûr et stable. La bibliothèque `postgres` venait de sortir en version 4.
- **Des migrations écrites à la main** ([migrations.ts](../../apps/service/src/database/migrations.ts)) : numérotées, chacune avec sa montée et sa descente, appliquées au démarrage du service, chacune dans une transaction et sous un verrou consultatif. Une migration livrée n'est jamais modifiée. Les tests montent, descendent et remontent chaque migration, et vérifient qu'une migration en échec ne laisse rien.

## Alternatives écartées

- **Redis ou une table dans la base de n8n** : n8n et le service ne partagent pas leurs données (ADR 0001), et une clé expirante ne garantit pas « une seule fois ».
- **Un outil de migration** (node-pg-migrate, Knex, Prisma) : une dépendance de plus, un format à apprendre, alors que vingt lignes suffisent pour quelques migrations par an. Un ORM est écarté par les bonnes pratiques.
- **Une file de messages** : n8n planifie et réessaie déjà, et la base suffit pour l'état.

## Conséquences

- ✅ Rejouer un relevé est sans effet : le smoke test le vérifie à travers n8n, sur le jeu synthétique.
- ✅ Le schéma suit le code : un service démarre toujours sur une base à jour.
- ❌ Les tests du service demandent PostgreSQL : `docker compose --profile tests up -d postgres-tests` en local.
- ❌ Sauvegarder la base `relais` devient nécessaire (phase 9).
