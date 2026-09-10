#!/usr/bin/env bash
# Restore the Kamkazi Postgres database from a backup made by backup-db.sh.
#
# Usage: scripts/restore-db.sh /tmp/kamkazi/backups/2026-09-06/kamkazi-20260906-031000.sql.gz
#
# WARNING: drops and recreates the public schema - all current data is lost.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FILE="${1:?Usage: scripts/restore-db.sh <backup.sql.gz>}"
[[ -f "$FILE" ]] || { echo "Backup file not found: $FILE" >&2; exit 1; }

read -rp "Restore $FILE over the current Kamkazi database? Type 'yes' to confirm: " ok
[[ "$ok" == "yes" ]] || { echo "Aborted."; exit 1; }

if docker ps --format '{{.Names}}' | grep -qx 'kamkazi-pg-prod'; then
  docker exec -i kamkazi-pg-prod psql -U kamkazi -d kamkazi \
    -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  gunzip -c "$FILE" | docker exec -i kamkazi-pg-prod psql -U kamkazi -d kamkazi
else
  DB_URL="${DATABASE_URL:-postgres://kamkazi:kamkazi@127.0.0.1:5434/kamkazi}"
  psql "$DB_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
  gunzip -c "$FILE" | psql "$DB_URL"
fi

echo "Restore complete. Run migrations if needed: npm run db:migrate"