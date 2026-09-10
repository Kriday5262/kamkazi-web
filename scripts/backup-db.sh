#!/usr/bin/env bash
# Backup the Kamkazi Postgres database.
#
# Usage: scripts/backup-db.sh
#
# Writes a gzipped pg_dump to /tmp/kamkazi/backups/YYYY-MM-DD/kamkazi-<ts>.sql.gz
# and prunes dated directories older than 14 days.
#
# Cron (daily 03:10):
#   10 3 * * * /tmp/kamkazi/scripts/backup-db.sh >> /tmp/kamkazi/backups/backup.log 2>&1

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$REPO_DIR/backups"
KEEP_DAYS=14
DAY="$(date +%F)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST_DIR="$BACKUP_ROOT/$DAY"
DEST="$DEST_DIR/kamkazi-$STAMP.sql.gz"

mkdir -p "$DEST_DIR"

# Read DATABASE_URL from .env if present, else default to the prod compose db.
DB_URL="${DATABASE_URL:-}"
if [[ -z "$DB_URL" && -f "$REPO_DIR/.env" ]]; then
  DB_URL="$(grep -E '^DATABASE_URL=' "$REPO_DIR/.env" | head -1 | cut -d= -f2- || true)"
fi
DB_URL="${DB_URL:-postgres://kamkazi:kamkazi@127.0.0.1:5434/kamkazi}"

# Prefer the prod compose container; fall back to host pg_dump.
if docker ps --format '{{.Names}}' | grep -qx 'kamkazi-pg-prod'; then
  docker exec kamkazi-pg-prod pg_dump -U kamkazi -d kamkazi | gzip > "$DEST"
else
  pg_dump "$DB_URL" | gzip > "$DEST"
fi

echo "Backup written: $DEST ($(du -h "$DEST" | cut -f1))"

# Prune backups older than KEEP_DAYS days.
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "Pruned backups older than $KEEP_DAYS days."