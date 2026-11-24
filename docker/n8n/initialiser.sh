#!/bin/sh
# Lancé avant n8n à chaque démarrage : (ré)enregistre l'identifiant du service, pour qu'il suive
# toujours la valeur de SECRET_PARTAGE dans .env.
# Les workflows, eux, ne sont importés qu'à la demande (pnpm n8n:importer) : un import automatique
# écraserait une modification faite dans l'interface et pas encore exportée.
set -eu

fichier=$(mktemp)
trap 'rm -f "$fichier"' EXIT

node /scripts/creer-l-identifiant-du-service.mjs "$fichier"
n8n import:credentials --input="$fichier"
