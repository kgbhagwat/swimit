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

# Read KEY=value lines safely (no bash 'source')
env_get() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" .env | head -1 || true)"
  if [ -z "$line" ]; then
    echo ""
    return 0
  fi
  line="${line#${key}=}"
  line="${line%$'\r'}"
  # strip optional surrounding quotes
  if [[ "$line" == \"*\" ]]; then
    line="${line:1:-1}"
  elif [[ "$line" == \'*\' ]]; then
    line="${line:1:-1}"
  fi
  printf '%s' "$line"
}

DOMAIN="$(env_get DOMAIN)"
POSTGRES_PASSWORD="$(env_get POSTGRES_PASSWORD)"
CORS_ORIGIN="$(env_get CORS_ORIGIN)"

if [ -z "${DOMAIN}" ] || [ -z "${POSTGRES_PASSWORD}" ] || [ -z "${CORS_ORIGIN}" ]; then
  echo "ERROR: .env must contain DOMAIN, POSTGRES_PASSWORD, and CORS_ORIGIN"
  echo "Current values:"
  echo "  DOMAIN='${DOMAIN}'"
  echo "  POSTGRES_PASSWORD='(set: $([ -n "${POSTGRES_PASSWORD}" ] && echo yes || echo no))'"
  echo "  CORS_ORIGIN='${CORS_ORIGIN}'"
  echo ""
  echo "Example .env:"
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
GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
GIT_SHORT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
GIT_SUBJ="$(git log -1 --pretty=%s 2>/dev/null || echo '')"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT BUILD_TIME
echo "==> Deploying commit: ${GIT_SHORT} — ${GIT_SUBJ}"
echo "    ${GIT_COMMIT}"
docker compose -f docker-compose.lightsail.yml --env-file .env build \
  --build-arg GIT_COMMIT="${GIT_COMMIT}" \
  --build-arg BUILD_TIME="${BUILD_TIME}"
docker compose -f docker-compose.lightsail.yml --env-file .env up -d

echo "==> Status"
docker compose -f docker-compose.lightsail.yml ps

echo ""
echo "Waiting a few seconds for HTTPS…"
sleep 5
curl -sS -m 20 "https://${DOMAIN}/api/health" || true
echo ""
echo -n "Running /api/version: "
curl -sS -m 20 "https://${DOMAIN}/api/version" || true
echo ""
echo "Confirm running commit equals: ${GIT_COMMIT}"
echo "Open https://${DOMAIN}"
echo "Login: code swimit / user superadmin / password superadmin"
