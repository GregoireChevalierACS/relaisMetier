# 0002 — Réutilisation de mailHelper et FindAndFill par sous-modules Git

- **Date :** 2026-11-24
- **Statut :** acceptée

## Contexte

Deux dépôts publics du même auteur contiennent déjà une bonne part du code générique dont relaisMetier a besoin :

- [mailHelper](https://github.com/GregoireChevalierACS/mailHelper) : domaine du courriel, règles de non-réponse, analyse par Claude encadrée par le domaine, contrat `BoiteDeReception` ;
- [FindAndFill](https://github.com/GregoireChevalierACS/FindAndFill) : lecture de sources Excel et CSV, remplissage déterministe de gabarits Excel.

Ces paquets ne sont pas publiés sur un registre npm. Le code générique qui manque (adapter IMAP, lecture des PDF par zones) doit être **contribué à son dépôt d'origine**, pas dupliqué ici.

## Décision

- **Sous-modules Git** dans `vendor/mailHelper` et `vendor/FindAndFill`, épinglés sur un commit précis.
- **Inclus dans le workspace pnpm**, mais seulement leurs paquets réutilisables (`vendor/*/packages/*`) : les applications de bureau ne sont ni installées ni construites.
- **Consommés par leur API publique** (`index.ts`), ce que vérifie la règle dependency-cruiser `api-publique-des-sous-modules`.
- **Leurs tests ne sont pas rejoués ici** : chaque dépôt a sa propre CI. Le lint, le formatage et l'architecture de relaisMetier ignorent `vendor/`.
- **Intégrés au service par le bundle** : tsdown intègre leurs sources TypeScript dans `dist/main.mjs`. L'image Docker n'a besoin que de Node.
- **Montées de version par Dependabot** (`gitsubmodule`) : chaque nouveau commit amont arrive en PR et passe la CI complète.

## Alternatives écartées

- **Publication sur npm ou GitHub Packages** : un pipeline de publication et une gestion de versions à maintenir dans deux dépôts, et un jeton de registre pour installer.
- **Dépendances Git dans `package.json`** (`github:…#commit`) : pnpm installe le dépôt entier comme un seul paquet, sans résoudre son workspace interne (`workspace:*`).
- **Copie du code** : deux versions qui divergent, et les corrections ne remontent plus.

## Conséquences

- ✅ Les dépôts étant publics, un `git clone --recurse-submodules` suffit, sans jeton.
- ✅ Une contribution à mailHelper ou FindAndFill se teste ici avant d'être proposée en amont : on modifie le sous-module, puis on y crée une branche.
- ❌ Il faut penser à `--recurse-submodules` au clonage (ou `git submodule update --init` ensuite). Le README le rappelle.
- ❌ Les dépendances de développement des sous-modules s'installent aussi, avec leurs propres versions de Vitest (mailHelper est en Vitest 4, d'où un avertissement de pair sans conséquence).
- ❌ `pnpm audit` couvre aussi leurs dépendances : une alerte chez eux bloque la CI ici, et se corrige en amont.
