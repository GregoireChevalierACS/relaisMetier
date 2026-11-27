# 0006 — Analyse CodeQL en local, identique à celle de la CI

- **Date :** 2026-11-27
- **Statut :** acceptée

## Contexte

CodeQL (`security-and-quality`) ne tournait que sur GitHub. Deux PR de suite ont échoué sur des alertes de sécurité que rien, en local, ne pouvait voir : un remplacement de la seule première occurrence d'un caractère dans la neutralisation des balises (`js/incomplete-sanitization`), puis une vérification d'existence suivie d'une lecture de fichier (`js/file-system-race`). Chaque fois, l'alerte n'apparaissait qu'après le push, au prix d'un commit de correction. La phase 3 touche justement ce que CodeQL surveille : scripts qui lisent des fichiers, nettoyage des contenus envoyés au modèle.

## Décision

- **`pnpm securite`** lance la même analyse qu'en CI, avant de pousser ([scripts/securite.mjs](../../scripts/securite.mjs)). Il échoue à la moindre alerte, de sécurité comme de qualité, et nomme le fichier, la ligne et la règle.
- **Une seule configuration** pour les deux, versionnée : [.github/codeql/codeql-config.yml](../../.github/codeql/codeql-config.yml) (suite `security-and-quality`, et les dossiers ignorés : sous-modules, données générées, rapports, couvertures, bundles).
- **Une seule version**, épinglée des deux côtés : le bundle CodeQL **2.27.6** (CLI et requêtes), dans le workflow (`tools:`) et dans le script (`VERSION_DE_CODEQL`). Sans épinglage, la CI prendrait le bundle du moment, et pourrait voir des alertes que l'analyse locale ne voit pas encore. Elles montent ensemble, à la main : Dependabot ne suit pas cette URL.
- **Installation hors du dépôt**, dans le profil de l'utilisateur, depuis la page de publication officielle, empreinte SHA-256 vérifiée :

  ```sh
  gh release download codeql-bundle-v2.27.6 -R github/codeql-action \
    -p 'codeql-bundle-win64.tar.gz' -p 'codeql-bundle-win64.tar.gz.checksum.txt'
  sha256sum -c codeql-bundle-win64.tar.gz.checksum.txt
  mkdir -p ~/.codeql/2.27.6 && tar -xzf codeql-bundle-win64.tar.gz -C ~/.codeql/2.27.6
  ```

  (`linux64` ou `osx64` sur les autres systèmes.) La variable `CODEQL` désigne un autre exécutable.

- **Vérifié** : l'analyse locale retrouve les deux alertes qui avaient fait échouer la CI, réintroduites dans un fichier jetable.

## Alternatives écartées

- **Une règle ESLint de sécurité** (eslint-plugin-security, eslint-plugin-no-unsanitized) : utile en complément, mais ses règles ne sont pas celles de CodeQL, qui suit le flux des données d'un fichier à l'autre. Elle n'aurait évité aucun des deux échecs de façon sûre.
- **Lancer CodeQL dans le hook de commit** : 2 minutes par commit, c'est trop. L'analyse se lance avant de pousser, comme le smoke test.
- **Se reposer sur la CI seule** : c'est ce qui coûtait un commit de correction par alerte.

## Conséquences

- ✅ Une alerte CodeQL se voit avant le push, avec le même verdict qu'en CI.
- ❌ Environ 1,2 Go dans le profil de l'utilisateur, et 2 minutes par analyse.
- ❌ Deux endroits à monter ensemble à chaque nouvelle version de CodeQL (workflow et script).
