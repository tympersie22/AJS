#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AJS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$AJS_DIR/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP="$(date -u +'%Y%m%dT%H%M%SZ')"
OUTPUT_FILE="$BACKUP_DIR/ajs-${TIMESTAMP}.sql.gz"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
docker compose --env-file "$ENV_FILE" -f "$AJS_DIR/docker-compose.prod.yml" exec -T postgres \
  sh -c 'pg_dump --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  | gzip -9 > "$OUTPUT_FILE"

test -s "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"
echo "Backup created: $OUTPUT_FILE"

# Nightly crontab example (02:00 UTC):
# 0 2 * * * /opt/ajs/apps/ajs/scripts/backup.sh >> /var/log/ajs-backup.log 2>&1
