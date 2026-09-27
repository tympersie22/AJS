#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AJS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$AJS_DIR/.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$AJS_DIR/docker-compose.prod.yml")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Create it from .env.production.example before deploying." >&2
  exit 1
fi

echo "[1/6] Pulling the latest source"
git -C "$AJS_DIR" pull --ff-only

echo "[2/6] Starting PostgreSQL and waiting for health"
"${COMPOSE[@]}" up -d --wait postgres

echo "[3/6] Building new API and frontend images before replacement"
"${COMPOSE[@]}" build --pull api frontend

echo "[4/6] Applying Prisma migrations with the newly built API image"
"${COMPOSE[@]}" run --rm --no-deps api npx prisma migrate deploy

echo "[5/6] Health-gated application restart"
"${COMPOSE[@]}" up -d --wait --remove-orphans

echo "[6/6] Following deployment logs for 30 seconds"
timeout 30s "${COMPOSE[@]}" logs --follow --tail=100 api frontend nginx || true

echo "AJS deployment completed."
