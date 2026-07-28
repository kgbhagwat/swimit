#!/bin/bash
# Run on the SwimIT staging VPS after code is on the server.
# Usage: bash /var/www/swimit/scripts/deploy-on-staging.sh
#
# Optional env overrides:
#   APP_DIR  STAGING_PORT  STAGING_HOST  STAGING_API_UNIT

set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/swimit}"
STAGING_PORT="${STAGING_PORT:-4010}"
STAGING_HOST="${STAGING_HOST:-staging.example.com}"
STAGING_API_UNIT="${STAGING_API_UNIT:-swimit-api-staging}"

cd "$APP_DIR"

if [ "${SKIP_GIT_PULL:-0}" = "1" ]; then
  echo "==> git pull (skipped — SKIP_GIT_PULL=1)"
else
  if [ -d .git ]; then
    echo "==> git pull"
    git pull --ff-only origin main || git pull --ff-only origin master || true
    echo "==> at commit: $(git log -1 --oneline 2>/dev/null || echo 'n/a')"
  else
    echo "==> no git repo — using files already in $APP_DIR"
  fi
fi

echo "==> npm install"
npm install

echo "==> build server + client"
npm run build

echo "==> ensure DB schema / seed"
if [ -f "$APP_DIR/server/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/server/.env"
  set +a
fi
npm run db:init

echo "==> restart ${STAGING_API_UNIT}"
if systemctl list-unit-files "${STAGING_API_UNIT}.service" 2>/dev/null | grep -q "${STAGING_API_UNIT}.service"; then
  sudo systemctl restart "$STAGING_API_UNIT"
  if ! systemctl is-active --quiet "$STAGING_API_UNIT" 2>/dev/null; then
    echo "ERROR: ${STAGING_API_UNIT} failed to start"
    echo "  journalctl -u ${STAGING_API_UNIT} -n 40 --no-pager"
    exit 1
  fi
else
  echo "WARN: ${STAGING_API_UNIT} not installed — run:"
  echo "  sudo bash $APP_DIR/scripts/setup-staging.sh"
fi

echo "==> reload nginx"
sudo systemctl reload nginx || true

sleep 1
echo "==> health check"
curl -s -m 8 "http://127.0.0.1:${STAGING_PORT}/api/health" || true
echo ""

echo "Deploy done. Open https://${STAGING_HOST} and hard-refresh (Ctrl+Shift+R)."
