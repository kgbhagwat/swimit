#!/bin/bash
# From your PC: rsync SwimIT to its own staging server (not shared with other apps).
# Usage:
#   STAGING_SSH=user@your-staging-host bash scripts/rsync-to-staging.sh
#
# Optional:
#   SSH_KEY=~/.ssh/id_ed25519
#   APP_DIR=/var/www/swimit

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGING_SSH="${STAGING_SSH:-}"
APP_DIR="${APP_DIR:-/var/www/swimit}"
SSH_KEY="${SSH_KEY:-}"

if [ -z "$STAGING_SSH" ]; then
  echo "Set STAGING_SSH to your SwimIT staging server, e.g.:"
  echo "  STAGING_SSH=user@staging.swimit.example.com bash scripts/rsync-to-staging.sh"
  exit 1
fi

RSYNC_SSH=(ssh -o IdentitiesOnly=yes)
if [ -n "$SSH_KEY" ]; then
  RSYNC_SSH=(ssh -i "$SSH_KEY" -o IdentitiesOnly=yes)
fi

echo "==> rsync → ${STAGING_SSH}:${APP_DIR}"
rsync -az --delete \
  --exclude node_modules \
  --exclude client/node_modules \
  --exclude server/node_modules \
  --exclude client/dist \
  --exclude server/dist \
  --exclude server/uploads \
  --exclude .env \
  --exclude server/.env \
  --exclude .git \
  -e "${RSYNC_SSH[*]}" \
  "$ROOT/" "${STAGING_SSH}:${APP_DIR}/"

echo "==> remote deploy"
"${RSYNC_SSH[@]}" "$STAGING_SSH" \
  "SKIP_GIT_PULL=1 bash ${APP_DIR}/scripts/deploy-on-staging.sh"

echo "Done."
