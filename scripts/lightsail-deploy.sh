#!/bin/bash
# Deploy / update SwimIT on Lightsail.
# Run from the repo root on the server:
#   bash scripts/lightsail-deploy.sh
#
# Prefer pre-built dist (from your PC) so Vite never runs on this small instance:
#   APP_DOCKERFILE=Dockerfile.prebuilt bash scripts/lightsail-deploy.sh

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
AUTH_SESSION_SECRET="$(env_get AUTH_SESSION_SECRET)"

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

if [ -z "${AUTH_SESSION_SECRET}" ]; then
  echo "==> generating AUTH_SESSION_SECRET in .env"
  AUTH_SESSION_SECRET="$(openssl rand -hex 32)"
  printf '\nAUTH_SESSION_SECRET=%s\n' "${AUTH_SESSION_SECRET}" >> .env
  chmod 600 .env
fi

if [ -d .git ]; then
  echo "==> git pull"
  git pull --ff-only || true
fi

HAS_CLIENT_DIST=0
HAS_SERVER_DIST=0
[ -f client/dist/index.html ] && HAS_CLIENT_DIST=1
[ -f server/dist/index.js ] && HAS_SERVER_DIST=1

if [ -z "${APP_DOCKERFILE:-}" ]; then
  if [ "$HAS_CLIENT_DIST" = 1 ] && [ "$HAS_SERVER_DIST" = 1 ]; then
    APP_DOCKERFILE=Dockerfile.prebuilt
  else
    APP_DOCKERFILE=Dockerfile
  fi
fi
export APP_DOCKERFILE

if [ "$APP_DOCKERFILE" = "Dockerfile.prebuilt" ]; then
  if [ "$HAS_CLIENT_DIST" != 1 ] || [ "$HAS_SERVER_DIST" != 1 ]; then
    echo "ERROR: Dockerfile.prebuilt needs client/dist and server/dist on this machine."
    echo "Build on your PC and deploy with:"
    echo "  bash scripts/deploy-staging-from-pc.sh"
    exit 1
  fi
  echo "==> Using prebuilt dist (no Vite on this server)"
else
  echo "==> WARNING: full Docker build runs Vite on this host."
  echo "    Small Lightsail plans often hang / exhaust CPU burst credits."
  echo "    Prefer: bash scripts/deploy-staging-from-pc.sh"
  if [ "${CONFIRM_FULL_BUILD:-}" != "1" ]; then
    echo "Refusing full in-server Vite build (set CONFIRM_FULL_BUILD=1 to override)."
    exit 1
  fi
fi

echo "==> Building and starting (domain: ${DOMAIN}, dockerfile: ${APP_DOCKERFILE})"
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
echo "Login: code swimit / user superadmin (default password superadmin only if never changed)"
