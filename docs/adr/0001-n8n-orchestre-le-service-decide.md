# 0001 — n8n orchestre, le service décide

- **Date :** 2026-11-24
- **Statut :** acceptée

## Contexte

relaisMetier automatise l'administratif d'une petite entreprise d'artisans : tri des courriels, mail d'accompagnement des devis, relances, commandes fournisseurs, rappels. Il faut à la fois de la **planification** (relever les boîtes toutes les 3 à 5 minutes, relancer à J+3, envoyer un tableau de bord le lundi) et des **règles métier** testables (qui attend une réponse, quand relancer, quand se taire).

n8n sait planifier, réessayer, alerter et se brancher à des services tiers. En revanche :

- il sait lire une boîte IMAP, mais **pas y déposer de brouillon** (aucun nœud ne fait d'IMAP `APPEND`), alors que tout ce qui part vers un tiers doit passer par un brouillon ;
- une règle écrite dans un nœud Code échappe au typage, aux tests, à la couverture et à la mutation.

## Décision

- **n8n orchestre** : planifications, reprises, workflow d'erreur et intégrations (agenda, dépôt de fichiers). Aucun nœud Code ne porte de règle métier.
- **Un service TypeScript décide**, en architecture hexagonale (domaine pur, cas d'usage, adapters HTTP, IMAP, Claude, PDF, Excel, PostgreSQL).
- **Un workflow appelle un cas d'usage** par une route HTTP nommée comme lui (`POST /boites/:id/relever`). La réponse dit ce qui a été fait, pour que l'exécution reste lisible dans n8n. Chaque appel est idempotent, puisque n8n réessaie.
- **Le service possède l'accès aux boîtes** et leurs secrets. n8n ne garde que les identifiants de ses propres intégrations, plus celui du service.
- **Le service n'est joignable que sur le réseau Docker interne** (aucun port publié), et chaque route exige l'en-tête `x-secret-partage`, comparé en temps constant. La valeur vient de `.env`. n8n la reçoit comme un identifiant `httpHeaderAuth` d'identifiant fixe (`serviceRelais001`), recréé à chaque démarrage par le conteneur `n8n-init` et chiffré par n8n : elle ne figure ni dans le dépôt, ni dans les workflows exportés.
- **Les workflows sont du code** : exportés en JSON dans `n8n/workflows/` (`pnpm n8n:exporter`), relus en PR, et importés dans un n8n neuf par la CI. L'import est explicite (`pnpm n8n:importer`) : un import automatique au démarrage écraserait une modification faite dans l'interface et pas encore exportée.

## Alternatives écartées

- **Tout dans n8n** (nœuds Code, nœud IMAP) : pas de dépôt de brouillon, et des règles métier non testées.
- **Tout dans le service** (planificateur maison, file de tâches) : on réécrirait les reprises, la planification, l'historique des exécutions et l'alerte qu'n8n fournit déjà.
- **Secret lu par les workflows dans l'environnement** (`$env`) : il faudrait ouvrir l'accès à toutes les variables d'environnement depuis les expressions (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`), clé de chiffrement comprise.

## Conséquences

- ✅ Les décisions sont couvertes à 100 % et par mutation, comme dans les autres dépôts de l'auteur.
- ✅ n8n reste remplaçable : il ne connaît que des routes HTTP.
- ✅ L'historique des exécutions de n8n montre ce que le service a fait, appel par appel.
- ❌ Deux composants à déployer et à surveiller au lieu d'un.
- ❌ Une modification dans l'interface de n8n doit être exportée avant d'être committée, sinon elle est perdue au prochain import.
