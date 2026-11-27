# Bonnes pratiques

Ce guide compile les pratiques de cinq dépôts du même auteur, et les adapte à un projet où **n8n orchestre** et un **service TypeScript décide** :

| Dépôt                                                                        | Ce qu'il apporte surtout                                                          |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [slideshowBuilder](https://github.com/GregoireChevalierACS/slideshowBuilder) | API HTTP, persistance, concurrence optimiste, Problem Details, tests de rendu     |
| [mailHelper](https://github.com/GregoireChevalierACS/mailHelper)             | Modèle de langage encadré par le domaine, contrat de boîte de réception, sécurité |
| [FindAndFill](https://github.com/GregoireChevalierACS/FindAndFill)           | Jeu de données synthétique, remplissage déterministe, guide générique             |
| [OnlinePlanner](https://github.com/GregoireChevalierACS/OnlinePlanner)       | Worker de notifications avec reprises, Docker, liste des pièges rencontrés        |
| [batchTester](https://github.com/GregoireChevalierACS/batchTester)           | Simulations reproductibles par graine, balayages de paramètres                    |

Chaque règle tient en une ligne d'action, suivie de sa raison. La [checklist](#checklist-avant-livraison) finale sert de revue avant une livraison. Les décisions détaillées sont dans les [ADR](adr/).

## Principes

- **Le métier d'abord.** Qui reçoit quoi, quand relancer, quand se taire : ces décisions viennent d'un domaine pur, sans framework ni entrée-sortie, testé à 100 % et par mutation.
- **Une règle n'existe que si un outil la vérifie.** Chaque règle de ce guide est tenue par le compilateur, ESLint, dependency-cruiser, un hook Git ou la CI. Une règle seulement écrite finit par être contournée.
- **Chaque motif de conception répond à un besoin réel.** Pas de framework d'injection, d'ORM ni de bus de messages : n8n tient déjà le rôle de planificateur.
- **Échouer tôt et bruyamment.** Configuration validée au démarrage, réponses du modèle revalidées, appels de n8n validés à l'entrée du service.
- **Tracer les décisions.** ADR, feuille de route avec critères de fin, commentaires qui expliquent le _pourquoi_ plutôt que le _quoi_.
- **Le modèle propose, le domaine décide.** Le modèle de langage trie et rédige. Il ne choisit jamais un destinataire et n'envoie rien.
- **L'outil propose, l'humain envoie.** Toute action visible par un tiers part en brouillon, sauf exception documentée et munie d'un interrupteur.

## n8n et le service

Ces règles sont propres à ce projet.

- **n8n ne décide rien.** Il planifie, déclenche, réessaie et alerte. Aucun nœud Code ne porte de règle métier : une règle qui vit dans n8n échappe aux tests, à la couverture et à la mutation.
- **Un workflow appelle un cas d'usage**, par une route HTTP nommée comme lui (`POST /boites/:id/relever`, `POST /relances/planifier`). La réponse dit ce qui a été fait, pour que l'exécution soit lisible dans n8n.
- **Les workflows sont du code** : exportés en JSON dans `n8n/workflows/`, relus en PR, et réimportés dans un n8n neuf par la CI. On ne modifie jamais un workflow en production sans réexporter.
- **Chaque appel est idempotent.** n8n réessaie : rejouer un relevé ou une planification ne doit jamais dupliquer un brouillon ou une relance. La clé d'idempotence vient des faits (`UIDVALIDITY` + `UID`, identifiant de devis), jamais de l'horloge.
- **Un workflow d'erreur unique** alerte l'administrateur, au plus une fois par heure et par cause.
- **Les secrets des boîtes appartiennent au service**, puisque c'est lui qui lit et dépose les brouillons. n8n ne garde que les identifiants de ses propres intégrations.
- **Le service n'est joignable que sur le réseau Docker interne**, et exige un secret partagé dans un en-tête. Seule l'interface de n8n est exposée, derrière HTTPS.

## Architecture

### Hexagonale, en monorepo pnpm

| Paquet                     | Rôle                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `packages/domain`          | Devis, séquence de relance, commande fournisseur, contrat d'entretien. Aucune dépendance. |
| `packages/application`     | Cas d'usage, ports, schémas zod des échanges et des sorties du modèle.                    |
| `packages/jeu-synthetique` | Générateur de données fictives et de leurs attendus, déterministe par graine.             |
| `apps/service`             | Adapters : HTTP (Hono), IMAP, Claude, PDF, Excel, PostgreSQL.                             |
| `vendor/*`                 | mailHelper et FindAndFill en sous-modules, consommés par leur API publique.               |

### Règles de dépendance vérifiées à deux niveaux

- **Dans l'éditeur et au commit**, ESLint (`no-restricted-imports`) interdit au domaine d'importer un framework, Node ou une autre couche.
- **En CI**, dependency-cruiser vérifie le graphe complet :

  | Règle                               | Ce qu'elle garantit                                                              |
  | ----------------------------------- | -------------------------------------------------------------------------------- |
  | `domaine-pur`                       | Le domaine ne dépend de rien                                                     |
  | `application-sans-infrastructure`   | La couche application ne connaît que le domaine et zod                           |
  | `api-publique-seulement`            | Chaque paquet, y compris ceux de `vendor/`, n'est importé que par son `index.ts` |
  | `llm-confine`                       | Seul l'adapter `llm` parle au modèle de langage                                  |
  | `imap-confine`                      | Seul l'adapter `imap` ouvre une connexion aux boîtes                             |
  | `base-de-donnees-confinee`          | Seul l'adapter `database` touche PostgreSQL                                      |
  | `pas-de-cycle`                      | Aucun cycle entre modules                                                        |
  | `production-independante-des-tests` | Le code livré n'importe ni test, ni doublure, ni jeu synthétique                 |
  | `production-sans-dependance-de-dev` | Le code livré n'utilise pas de dépendance de développement                       |
  | `pas-de-fourre-tout`                | Pas de `utils`, `helpers`, `common`…                                             |
  | `pas-d-orphelin`                    | Pas de module que personne n'importe (code mort)                                 |

### Composition

- **Ports déclarés là où ils servent**, dans la couche application : `BoiteDeReception`, `DepositaireDeBrouillon`, `Analyseur`, `LecteurDeDevis`, `OuvreurGabarit`, `DepotDeSequences`, `Horloge`.
- **Composition manuelle**, sans framework d'injection : `creerLesCasDUsage({ boites, analyseur, depot, horloge })`. Un seul _composition root_ (`main.ts`).
- **Même application en production et en test** : `creerLApplication(casDUsage)` ne change que par les cas d'usage injectés.
- **Code générique remonté dans son dépôt d'origine** : l'adapter IMAP va dans mailHelper, la lecture des PDF par zones dans FindAndFill. Ce dépôt ne garde que le métier du cas étudié.

## Modélisation du domaine

- **Langage métier, en français** : `Devis`, `SequenceDeRelance`, `CommandeFournisseur`, `ContratDEntretien`. Pas de `Data`, `Manager` ou `Helper`.
- **Value Objects immuables, validés à la création** : `AdresseCourriel`, `Montant`, `DateLocale`, `Delai`. Un objet invalide ne peut pas exister.
- **Invariants portés par les types** :
  - types marqués (`IdDeDevis`, `Instant`), validés à l'entrée par des gardes de type, sans transtypage ;
  - unions discriminées (`kind`) pour les états, les décisions et les erreurs ;
  - vérification d'exhaustivité des `switch` par ESLint.

  Les choix fermés des schémas zod listent exactement ceux du domaine (`z.enum(ETATS)`, `satisfies z.ZodType<…>`), sinon la compilation échoue.

- **Erreurs métier en `Result<T, E>`**, jamais en exceptions. Les exceptions sont réservées aux pannes : réponse hors contrat, stock corrompu, bug.
- **Fonctions pures et déterministes.** ESLint interdit `new Date()`, `Date.now()` et `Math.random()` dans le domaine : le temps passe par le port `Horloge`.
- **Dériver l'état plutôt que le synchroniser** : une séquence de relance se recalcule à partir des faits (devis envoyé, réponse reçue). L'ordre d'arrivée des faits ne change pas le résultat, et un fait reçu deux fois ne compte qu'une fois.
- **Historiser au lieu d'écraser** : un fait enregistré ne se modifie pas, on en ajoute un autre.
- **Motifs utilisés pour un besoin précis**, par exemple _Specification_ composable pour décider si un courriel attend une réponse, ou _Strategy_ pour le canal d'une relance (brouillon ou envoi).

## Modèle de langage

- **Déterministe d'abord, IA ensuite** : les règles du domaine passent avant le modèle et l'emportent sur lui. Un robot ou une lettre d'information n'attend jamais de réponse, quoi qu'en dise le modèle.
- **Le bon modèle pour chaque tâche** : un petit modèle pour trier et classer, un plus grand pour rédiger, et seulement quand une réponse est attendue.
- **Sorties structurées**, revalidées par zod à la réception. Un refus, un champ inventé ou une réponse tronquée sont des cas de test.
- **Contenus externes encadrés** dans des balises qu'ils ne peuvent pas fermer, et présentés comme des données. Le pire résultat possible d'une injection reste un brouillon que l'humain voit avant tout envoi.
- **Le moins de données possible** : on envoie au modèle les champs extraits d'un devis, pas le PDF entier. Les pièces sensibles (avis d'imposition, pièces d'identité) ne passent jamais par une IA en ligne.
- **Jeu d'évaluation** de 50 cas synthétiques avec la réponse attendue, rejoué à chaque changement de consigne ou de modèle.
- **Mesurer avant de choisir** : temps et coût d'un relevé type, comparés entre modèles et niveaux d'effort.
- **Parallélisme borné**, pour ne saturer ni les quotas d'API ni la machine.

## Tests

### Pyramide

| Niveau        | Outil                           | Exemples                                                                                                          |
| ------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Unitaire      | Vitest                          | Value Objects, règles de non-réponse, séquence de relance                                                         |
| Propriétés    | fast-check                      | Ordre d'arrivée des faits sans effet, idempotence d'un relevé, aller-retour des formats                           |
| Contrat       | Vitest                          | Le même comportement exigé de la boîte en mémoire et de la boîte IMAP, du dépôt en mémoire et du dépôt PostgreSQL |
| Intégration   | Vitest + GreenMail + PostgreSQL | Chaque route, chaque statut ; dépôt réel d'un brouillon avec pièce jointe                                         |
| Workflows     | CI                              | Chaque JSON de `n8n/workflows/` s'importe dans un n8n neuf et appelle les bonnes routes                           |
| Évaluation IA | Jeu synthétique                 | Décision « réponse attendue » et classement des réponses fournisseurs, à chaque changement de consigne            |
| Smoke test    | Script Node                     | `docker compose up` puis `GET /sante`                                                                             |
| Charge        | batchTester                     | Semaine de pointe simulée : durée et coût                                                                         |
| Mutation      | Stryker, sur le domaine         | Seuil bloquant à 80 %                                                                                             |

### Règles

- **100 % de couverture** (lignes, branches, fonctions), imposée par `vitest.config.ts`. Seuls le _composition root_, les `index.ts` et les doublures en sont exclus. Une branche inatteignable se supprime au lieu d'être ignorée.
- **Fakes plutôt que mocks** : un mock vérifie des appels, un Fake tenu par un contrat vérifie un comportement. Le Fake et l'adapter réel passent la même suite.
- **Le modèle de langage n'est jamais appelé en test** : l'analyseur reçoit une fonction d'envoi injectée.
- **Aucune donnée réelle dans le dépôt** : les tests et les démonstrations utilisent le jeu synthétique, généré par graine.
- **Scénarios de référence justifiés** : les dates de relance attendues sont recalculées à la main dans le test (« envoyé le vendredi 4, J+3 tombe un lundi »).
- **Un mutant équivalent ne s'ignore qu'avec une justification écrite**, à côté du code (`// Stryker disable next-line … : raison`).
- **Fixtures paresseuses** : des fonctions (`unDevis()`, `unCourriel()`), jamais des objets construits au chargement d'un fichier.
- **Concurrence testée** : deux relevés simultanés ne créent qu'une relance, et une écriture concurrente est refusée au lieu d'écraser.

## Typage et style

- **TypeScript au plus strict** :
  - `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` ;
  - `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns` ;
  - `verbatimModuleSyntax`, `useUnknownInCatchVariables`.
- **ESLint `strictTypeChecked` et `stylisticTypeChecked`** :
  - pas de `any` ;
  - **aucune assertion de type `as`** (`assertionStyle: 'never'`) ;
  - imports de types explicites, `switch` exhaustifs, `eqeqeq` ;
  - toute désactivation d'une règle porte une justification (`eslint-comments/require-description`), et une désactivation devenue inutile est une erreur ;
  - zéro avertissement toléré.
- **Les données externes sont validées par zod, jamais transtypées** : appels de n8n, réponses du modèle, en-têtes IMAP, lignes de la base, fichiers Excel et PDF lus.
- **Prettier et `.editorconfig`**, appliqués à chaque commit par lint-staged. Fins de ligne LF imposées par `.gitattributes`, même sous Windows.
- **Code, commentaires et documentation en français**, comme le métier.

## API et persistance

- **Validation à trois niveaux** :

  | Niveau       | Outil       | Statut                                   |
  | ------------ | ----------- | ---------------------------------------- |
  | Structure    | zod         | 400                                      |
  | Règle métier | domaine     | 422, avec le champ fautif                |
  | État         | cas d'usage | 404 (introuvable), 409 (version périmée) |

- **Erreurs au format Problem Details** (RFC 9457), avec un `type` stable et un catalogue. Une erreur interne n'expose jamais son détail.
- **Un seul contrat d'échange** : les mêmes schémas zod servent au service et aux tests des workflows.
- **Concurrence optimiste** : on écrit en indiquant la version lue. Une écriture concurrente est refusée, jamais écrasée.
- **Stock relu par les règles du domaine** : une ligne modifiée à la main est détectée comme une panne au lieu d'être crue.
- **Migrations versionnées**, jamais modifiées une fois livrées, testées à la montée et à la descente, chacune dans une transaction.
- **Import idempotent et atomique** : un fichier est validé en entier avant la moindre écriture.
- **Configuration validée au démarrage**, sans jamais afficher la valeur reçue (elle pourrait être un secret). Un modèle `.env.example` est versionné, jamais le `.env`.

## Sécurité

- **Permissions minimales** : un compte de boîte qui sait lire et déposer des brouillons. L'envoi par SMTP n'est configuré que pour les relances, et seulement si on l'active.
- **Secrets hors du dépôt** : variables d'environnement de `compose.yaml` lues depuis un fichier ignoré par Git. Secret scanning et _push protection_ activés sur GitHub, et GitGuardian contre les secrets commités.
- **Service jamais exposé**, secret partagé entre n8n et le service, HTTPS devant n8n.
- **Moindre privilège en CI** : `permissions: contents: read` par défaut.
- **Dépendances surveillées** :
  - `pnpm audit --audit-level high` bloquant en CI ;
  - analyse CodeQL (`security-and-quality`) à chaque PR et chaque semaine, et **en local avant de pousser** (`pnpm securite`, même version et même configuration, [ADR 0006](adr/0006-analyse-codeql-locale.md)) ;
  - Dependabot pour les paquets, les actions GitHub et les images Docker.
- **Quarantaine des versions** : `minimumReleaseAge` de 3 jours, et scripts d'installation bloqués sauf exception listée.
- **Versions exactes** (`save-exact`), lockfile figé en CI (`--frozen-lockfile`), Node et pnpm épinglés (`.node-version`, `packageManager`, `engine-strict`). Images Docker épinglées par version, n8n compris.
- **Alertes traitées, jamais masquées** : un _override_ ciblé et commenté, avec la condition pour le retirer.

## Robustesse

- **Prévoir un repli pour chaque dépendance incertaine** : une boîte injoignable, un PDF au format inconnu ou un modèle qui refuse mènent à un comportement défini, pas à un plantage.
- **Reprises bornées, puis mise de côté** : après 3 échecs, un traitement est mis de côté et signalé, comme les messages en échec du worker d'OnlinePlanner.
- **Attendre chaque promesse**, et suivre les dépréciations à chaque montée de version.
- **Tester sur un vrai environnement ce que la documentation ne garantit pas** (par exemple l'affichage des brouillons sur mobile), et prévoir le repli dès le départ.
- **Sauvegarde vérifiée par une restauration**, pas seulement par sa présence.

## Git et intégration continue

- **Format de commit vérifié** : `aaaa-mm-jj # N : (type) message`, contrôlé par commitlint au commit et en CI, date comprise. Seul Dependabot en est exempté, reconnu par l'auteur de la PR et non par le message, qui serait falsifiable.
- **Types** : `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`, `style`, `perf`.
- **`main` n'évolue que par pull request**, même en solo : branche protégée, et hook _pre-commit_ qui refuse un commit direct sur `main`.
- **Branches courtes** (`feat/…`, `docs/…`), créées depuis `origin/main` (`git switch -c X origin/main`), avec de petits commits atomiques.
- **Husky et lint-staged** : ESLint et Prettier sur les fichiers modifiés à chaque commit.
- **CI en une passe** : audit → format des commits → lint → architecture → formatage → types → tests et couverture → build → import des workflows → smoke test → mutation.
  - Rapports de mutation et d'évaluation archivés.
  - Une exécution obsolète est annulée (`concurrency`).
  - Chaque job a une durée maximale (`timeout-minutes`).

## Documentation

- **ADR** pour chaque décision structurante : contexte, décision, alternatives écartées, conséquences positives et négatives.
- **[Feuille de route](../ROADMAP.md)** : un critère vérifiable « terminé quand… » par phase. On coche ce qui est fait, et on note chaque défaut non corrigé.
- **Pièges rencontrés**, dans un tableau : symptôme, cause, contournement, lien vers l'ADR ou le commit.
- **README exécutable** : démarrage, configuration, commandes de vérification, problèmes courants.
- **Chaque exception est justifiée à côté de la règle** qu'elle contourne.

## Écarté délibérément

Ces pratiques sont valables ailleurs, mais disproportionnées ici :

- bus de messages, outbox, file de tâches dédiée : n8n planifie et réessaie ;
- mode « queue » de n8n, plusieurs workers, Kubernetes : les volumes d'une petite entreprise tiennent sur une seule machine ;
- framework d'injection de dépendances, ORM ;
- interface web propre au service : la validation se fait dans la messagerie, le suivi dans un Excel hebdomadaire ;
- comparaison de captures d'écran : trop fragile d'une machine à l'autre.

## Checklist avant livraison

- [ ] Le domaine ne dépend d'aucune bibliothèque externe ni d'aucun service.
- [ ] Aucun nœud Code de n8n ne porte de règle métier, et chaque workflow versionné s'importe dans un n8n neuf.
- [ ] Chaque appel de n8n au service est idempotent.
- [ ] Chaque service externe passe par un contrat testé sur tous ses adapters.
- [ ] La CI exige 100 % de couverture et un score de mutation ≥ 80 % sur le domaine.
- [ ] Aucune donnée réelle ni aucun secret dans le dépôt.
- [ ] Les contenus externes envoyés à une IA sont encadrés, et ses sorties sont structurées avec un repli.
- [ ] Le jeu d'évaluation IA a été rejoué après le dernier changement de consigne ou de modèle.
- [ ] Toute action visible par un tiers part en brouillon, ou passe par un interrupteur documenté.
- [ ] Le service n'est pas exposé, et une sauvegarde a été restaurée avec succès.
- [ ] Le critère « Terminée quand » de la phase est rempli, et les pièges rencontrés sont documentés.
