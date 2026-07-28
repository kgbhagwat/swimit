#!/bin/bash
# Deploy / update SwimIT on Lightsail.
# Run from the repo root on the server:
#   bash scripts/lightsail-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Missing .env — copy and edit first:"
  echo "  cp .env.lightsail.example .env"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

if [ -z "${DOMAIN:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "DOMAIN and POSTGRES_PASSWORD must be set in .env"
  exit 1
fi

if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only || true
fi

echo "==> Building and starting (domain: ${DOMAIN})"
docker compose -f docker-compose.lightsail.yml --env-file .env up -d --build

echo "==> Status"
docker compose -f docker-compose.lightsail.yml ps

echo ""
echo "Health (via container network may take ~30s on first boot):"
sleep 3
curl -sS -m 15 "https://${DOMAIN}/api/health" || curl -sS -m 10 "http://127.0.0.1:4000/api/health" || true
echo ""
echo "Open https://${DOMAIN}"
echo "Login: code swimit / user superadmin / password superadmin"
