# 0005 — Tri par Claude Haiku 5.5, rédaction par Claude Sonnet 5.5, encadrés par le domaine

- **Date :** 2026-11-26
- **Statut :** acceptée

## Contexte

Après le relevé, les règles déterministes de mailHelper ont déjà écarté les robots et les lettres d'information. Il reste les courriels qui demandent un jugement : une demande de devis, une question, un fournisseur qui annonce une rupture attendent une réponse ; une confirmation de commande, non. Pour ceux qui en attendent une, il faut un brouillon que l'équipe relira et enverra.

## Décision

- **Deux modèles, chacun à sa tâche** (choix de la feuille de route) : Claude Haiku 5.5 décide si une réponse est attendue (effort bas, sortie structurée `{ reponseAttendue, motif }`) ; Claude Sonnet 5.5 rédige le corps de la réponse (effort moyen, `{ texte }`), **seulement** quand une réponse est attendue.
- **Le modèle propose, le domaine décide** :
  - les règles de mailHelper l'emportent toujours, même si le modèle juge qu'une réponse est attendue ;
  - le destinataire et l'objet viennent du courriel (`preparerLeBrouillon` de mailHelper), jamais du modèle ;
  - les sorties sont contraintes par un schéma (sorties structurées), puis revalidées par zod : une réponse hors format est un échec, pas une donnée.
- **Contre l'injection de consignes**, trois défenses : le courriel est présenté entre balises qu'il ne peut pas fermer, et comme une donnée ; le destinataire ne peut pas être changé par le modèle ; le pire résultat possible reste un brouillon qu'un humain relit avant tout envoi.
- **La base de réponses aux questions fréquentes** ([config/reponses-frequentes.md](../../config/reponses-frequentes.md)) forme avec la consigne un préfixe stable, mis en cache : seul le courriel change d'un appel à l'autre. Le modèle n'invente aucun prix ni délai qu'elle ne donne pas ; il laisse des `[emplacements]`.
- **Réservation avant traitement** : `POST /boites/:id/trier` réserve les courriels à trier (`FOR UPDATE SKIP LOCKED`, 15 minutes). Deux tris qui se chevauchent ne traitent jamais le même courriel, donc ne déposent jamais deux brouillons. Une réservation expirée (service arrêté) est reprise.
- **Reprises bornées** (`apresUnEchec` dans le domaine) : un échec du tri, de la rédaction ou du dépôt remet le courriel à trier ; au troisième, il est mis de côté avec sa cause, pour un humain. Une boîte injoignable rend ses courriels sans consommer de tentative.
- **Repli sur refus** : Claude Sonnet 5.5 est appelé avec le repli côté serveur (`fallbacks: "default"`), qui relance la demande sur un modèle de repli en cas de refus. Claude Haiku 5.5 n'en a pas : un refus est un échec, retenté puis mis de côté.
- **Sans clé d'API, le tri est désactivé**, pas en panne : `POST /boites/:id/trier` répond « désactivé » sans rien réserver ni consommer. La CI et le smoke test tournent ainsi sans clé et sans coût ; le vrai tri est mesuré par l'évaluation, lancée sciemment.
- **Le modèle n'est jamais appelé dans les tests** : les adapters reçoivent une fonction d'envoi injectée, et la couche application des modèles scriptés.

## Alternatives écartées

- **Un seul appel qui trie et rédige** (l'analyseur de mailHelper) : il paierait la rédaction par le grand modèle pour chaque courriel, y compris ceux qui n'attendent pas de réponse.
- **Haiku pour tout** : la rédaction d'un brouillon que l'équipe signera mérite un modèle plus fin ; à mesurer en 3c si le coût le justifie.
- **Mettre à jour l'état après coup, sans réservation** : deux tris simultanés déposeraient deux brouillons avant que l'un ou l'autre n'écrive dans le journal.

## Conséquences

- ✅ Chaque brouillon a le bon destinataire et le bon objet, quoi que dise le courriel ou le modèle.
- ✅ Une panne du modèle ou de la boîte n'arrête rien : le courriel est retenté, puis signalé.
- ❌ Si le dépôt du brouillon réussit et que l'écriture dans le journal échoue (base tombée à cet instant), le courriel sera retraité et un second brouillon déposé. Rare, visible (deux brouillons identiques), et sans envoi.
- ❌ Un courriel qui sort de la fenêtre de relecture (72 heures) avant d'être trié n'est plus retrouvé : il est mis de côté après trois tentatives.
