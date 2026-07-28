#!/bin/bash
# Deploy / update SwimIT on Lightsail.
# Run from the repo root on the server:
#   bash scripts/lightsail-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Missing .env — create it with:"
  echo "  cp .env.lightsail.example .env"
  echo "  nano .env"
  exit 1
fi

# Read values without 'source' (avoids bash errors from comments / bad lines)
DOMAIN="$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '\"' | tr -d \"'\")"
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '\"' | tr -d \"'\")"
CORS_ORIGIN="$(grep -E '^CORS_ORIGIN=' .env | head -1 | cut -d= -f2- | tr -d '\r' | tr -d '\"' | tr -d \"'\")"

if [ -z "${DOMAIN}" ] || [ -z "${POSTGRES_PASSWORD}" ] || [ -z "${CORS_ORIGIN}" ]; then
  echo "ERROR: .env must contain DOMAIN, POSTGRES_PASSWORD, and CORS_ORIGIN"
  echo "Example:"
  cat <<'EOF'
DOMAIN=staging.swimit.co.in
POSTGRES_USER=swimit
POSTGRES_PASSWORD=your-strong-password-here
POSTGRES_DB=swimit
CORS_ORIGIN=https://staging.swimit.co.in
EOF
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
echo "Waiting a few seconds for HTTPS…"
sleep 5
curl -sS -m 20 "https://${DOMAIN}/api/health" || true
echo ""
echo "Open https://${DOMAIN}"
echo "Login: code swimit / user superadmin / password superadmin"
