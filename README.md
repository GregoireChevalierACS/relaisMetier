# relaisMetier

Démonstration : automatiser l'administratif d'une petite entreprise d'artisans **fictive**, avec **n8n** comme chef d'orchestre et un **service TypeScript** qui porte les règles métier. Toutes les données sont synthétiques.

- Ce qui est prévu, phase par phase : [ROADMAP.md](ROADMAP.md)
- Comment le code est écrit : [docs/bonnes-pratiques.md](docs/bonnes-pratiques.md)
- Pourquoi : [docs/adr/](docs/adr/)

## Prérequis

- Docker (avec Compose v2)
- Node 24 (version exacte dans `.node-version`) et pnpm, activé par `corepack enable`
- Git

## Démarrage

```sh
git clone --recurse-submodules <url du dépôt>
cd relaisMetier
pnpm install
pnpm env:creer          # crée .env avec des secrets aléatoires (jamais versionné)
docker compose up -d --build --wait
pnpm n8n:importer       # importe les workflows versionnés dans n8n
```

L'interface de n8n est sur <http://127.0.0.1:5678>. Au premier accès, elle demande de créer le compte propriétaire.

Pour vérifier que tout fonctionne de bout en bout :

```sh
pnpm smoke              # démarre la pile, importe les workflows, exécute « Vérifier le service »
```

## Ce que contient la pile

| Conteneur   | Rôle                                                                           | Accès depuis la machine  |
| ----------- | ------------------------------------------------------------------------------ | ------------------------ |
| `n8n`       | Planifie, déclenche, réessaie, alerte                                          | `127.0.0.1:5678`         |
| `n8n-init`  | Enregistre l'identifiant du service dans n8n à chaque démarrage, puis s'arrête | —                        |
| `service`   | Règles métier, accès aux boîtes (`GET /sante` pour l'instant)                  | aucun (réseau interne)   |
| `postgres`  | Une base `n8n`, une base `relais`, chacune avec son rôle                       | aucun                    |
| `greenmail` | Serveur SMTP et IMAP de test                                                   | `127.0.0.1:3025`, `3143` |

Le service n'est joignable que par n8n, et chaque route exige l'en-tête `x-secret-partage` ([ADR 0001](docs/adr/0001-n8n-orchestre-le-service-decide.md)).

## Configuration

Toutes les variables sont décrites dans [.env.example](.env.example). `pnpm env:creer` ne remplace jamais un `.env` existant.

**Sauvegardez `N8N_ENCRYPTION_KEY`** : sans elle, les identifiants enregistrés dans n8n sont illisibles.

## Jeu de données synthétique

Toutes les données du projet sont fictives et générées par graine :

```sh
pnpm generer:jeu --graine 42   # écrit donnees-synthetiques/ (courriels, devis PDF, exports Excel, attendus.json)
pnpm jeu:charger               # vide les boîtes de GreenMail et y charge les courriels
```

La même graine redonne exactement les mêmes fichiers. Les attendus de chaque fichier (catégorie d'un courriel, champs d'un devis…) sont dans `attendus.json`. Le détail est dans la [feuille de route](ROADMAP.md#phase-1--jeu-de-données-synthétique).

## Modifier un workflow

Les workflows sont du code : `n8n/workflows/*.json` fait foi.

1. Modifier le workflow dans l'interface de n8n.
2. `pnpm n8n:exporter` : réécrit les JSON, sans les champs propres à l'instance (dates, versions, projet).
3. Relire le diff, committer.

`pnpm n8n:importer` remplace les workflows de n8n par ceux du dépôt : une modification non exportée est perdue.

## Commandes de vérification

| Commande                 | Vérifie                                                  |
| ------------------------ | -------------------------------------------------------- |
| `pnpm lint`              | ESLint typé strict, zéro avertissement                   |
| `pnpm lint:architecture` | Règles de dépendance (dependency-cruiser)                |
| `pnpm format:check`      | Formatage Prettier                                       |
| `pnpm typecheck`         | Types de tous les paquets                                |
| `pnpm test:coverage`     | Tests, avec 100 % de couverture exigés                   |
| `pnpm test:mutation`     | Test de mutation du domaine (seuil 80 %)                 |
| `pnpm build`             | Bundle du service                                        |
| `pnpm smoke`             | Pile Docker, import des workflows, appel de `GET /sante` |
| `pnpm generer:jeu`       | Jeu synthétique reproductible (`--graine`, `--sortie`)   |

La CI les rejoue toutes, plus `pnpm audit` et le format des commits.

## Contribuer

- `main` n'évolue que par pull request : `git switch -c feat/… origin/main`.
- Format des commits, vérifié par commitlint : `aaaa-mm-jj # N : (type) message`, où N est le numéro du commit dans la journée. Types : `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `style`, `perf`.

## Problèmes courants

| Symptôme                                                                                          | Solution                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `additional privileges requested: pass "--allow=fs.read=…"` à `docker compose build` sous Windows | La lettre du lecteur du dossier courant est en minuscule (`c:\…`, cas de VS Code). Lancer la commande depuis `C:\…`, ou passer par `pnpm smoke`, qui corrige la casse. |
| `vendor/mailHelper` ou `vendor/FindAndFill` vide                                                  | Le dépôt a été cloné sans `--recurse-submodules` : `git submodule update --init`.                                                                                      |
| `à définir dans .env` au démarrage de Compose                                                     | `pnpm env:creer`.                                                                                                                                                      |
| Le workflow « Vérifier le service » reçoit 401                                                    | `.env` a changé depuis le dernier démarrage : `docker compose up -d` relance `n8n-init`, qui met l'identifiant à jour.                                                 |
