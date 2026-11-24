#!/bin/sh
# Exécuté une seule fois, au premier démarrage de PostgreSQL (volume vide).
# Une base et un rôle par usage : n8n et le service ne voient pas les données l'un de l'autre.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v mdp_n8n="$N8N_DB_PASSWORD" -v mdp_service="$SERVICE_DB_PASSWORD" <<'SQL'
CREATE ROLE n8n LOGIN PASSWORD :'mdp_n8n';
CREATE DATABASE n8n OWNER n8n;
REVOKE ALL ON DATABASE n8n FROM PUBLIC;

CREATE ROLE relais LOGIN PASSWORD :'mdp_service';
CREATE DATABASE relais OWNER relais;
REVOKE ALL ON DATABASE relais FROM PUBLIC;
SQL
