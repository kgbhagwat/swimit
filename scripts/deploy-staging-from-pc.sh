#!/bin/bash
# Deploy SwimIT staging from your PC:
#   1) build client+server locally (Vite never runs on Lightsail)
#   2) git pull on the server
#   3) rsync dist folders
#   4) docker compose with Dockerfile.prebuilt
#
# Prerequisites (one-time):
#   1. Download the Lightsail SSH key. Save e.g. as:
#        ~/.ssh/swimit-staging.pem
#   2. Restrict permissions (Git Bash / WSL):
#        chmod 600 ~/.ssh/swimit-staging.pem
#
# Usage (from PC, repo root):
#   bash scripts/deploy-staging-from-pc.sh
#   bash scripts/deploy-staging-from-pc.sh ~/.ssh/swimit-staging.pem

set -euo pipefail

HOST="${SWIMIT_STAGING_HOST:-43.204.61.9}"
USER_NAME="${SWIMIT_STAGING_USER:-ubuntu}"
REMOTE_DIR="${SWIMIT_REMOTE_DIR:-/opt/swimit}"
KEY="${1:-${SWIMIT_SSH_KEY:-$HOME/.ssh/swimit-staging.pem}}"

# Expand ~
KEY="${KEY/#\~/$HOME}"

# This script must run on your PC / laptop — not inside the Lightsail SSH session.
if [ -d /opt/swimit ] && [ "$(hostname -I 2>/dev/null | tr -d ' ' | head -c 3 || true)" != "" ]; then
  if [ -f /opt/swimit/docker-compose.lightsail.yml ] || [ "$(pwd)" = /opt/swimit ]; then
    echo "You are on the Lightsail server. Do NOT run this script here."
    echo ""
    echo "On your Windows PC (Git Bash / WSL), from the swimIT repo folder:"
    echo "  bash scripts/deploy-staging-from-pc.sh"
    echo ""
    echo "Or with an explicit key path:"
    echo "  bash scripts/deploy-staging-from-pc.sh /c/Users/YOU/.ssh/swimit-staging.pem"
    echo ""
    echo "If dist was already copied to this server, finish deploy with:"
    echo "  cd /opt/swimit"
    echo "  git pull --ff-only"
    echo "  APP_DOCKERFILE=Dockerfile.prebuilt bash scripts/lightsail-deploy.sh"
    exit 1
  fi
fi

if [ ! -f "$KEY" ]; then
  echo "SSH key not found: $KEY"
  echo ""
  echo "This script runs on your PC, not on Lightsail."
  echo "Download the Lightsail key and save it, then run from the swimIT repo:"
  echo "  bash scripts/deploy-staging-from-pc.sh /path/to/your-key.pem"
  echo ""
  echo "Example (Windows Git Bash):"
  echo "  bash scripts/deploy-staging-from-pc.sh /c/Users/sneha/.ssh/swimit-staging.pem"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)
RSYNC_RSH="ssh -i ${KEY} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"

echo "==> Deploying to ${USER_NAME}@${HOST}:${REMOTE_DIR}"
echo "==> Using key: $KEY"

if git rev-parse HEAD >/dev/null 2>&1; then
  LOCAL_COMMIT="$(git rev-parse HEAD)"
  LOCAL_SHORT="$(git rev-parse --short HEAD)"
  LOCAL_SUBJ="$(git log -1 --pretty=%s)"
  echo "==> Expected commit (push to GitHub first if needed):"
  echo "    ${LOCAL_SHORT} ${LOCAL_SUBJ}"
  echo "    ${LOCAL_COMMIT}"
fi

echo "==> Building client + server on this PC (avoids Lightsail Vite hang)"
if [ "${SKIP_BUILD:-}" = "1" ]; then
  echo "    SKIP_BUILD=1 — using existing client/dist and server/dist"
else
  npm run build
fi

if [ ! -f client/dist/index.html ] || [ ! -f server/dist/index.js ]; then
  echo "ERROR: build did not produce client/dist and server/dist"
  exit 1
fi

echo "==> git pull on server"
"${SSH[@]}" "${USER_NAME}@${HOST}" \
  "set -euo pipefail
   cd '${REMOTE_DIR}'
   git pull --ff-only
   echo 'repo HEAD:'
   git rev-parse HEAD
   git log -1 --oneline
   mkdir -p client/dist server/dist
  "

SCP=(scp -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)

sync_dist_dir() {
  local subdir="$1"
  local remote_path="${REMOTE_DIR}/${subdir}/dist"
  echo "==> Upload ${subdir}/dist to server"
  "${SSH[@]}" "${USER_NAME}@${HOST}" \
    "rm -rf '${remote_path}' && mkdir -p '${remote_path}'"

  if command -v rsync >/dev/null 2>&1; then
    rsync -az --delete -e "$RSYNC_RSH" \
      "${ROOT}/${subdir}/dist/" "${USER_NAME}@${HOST}:${remote_path}/"
    return
  fi

  echo "    (rsync not installed — using tar over SSH; Git for Windows includes tar)"
  if ! command -v tar >/dev/null 2>&1; then
    echo "ERROR: need rsync or tar. Install Git for Windows or run: scoop install rsync"
    exit 1
  fi
  tar -C "${ROOT}/${subdir}" -cf - dist | "${SSH[@]}" "${USER_NAME}@${HOST}" \
    "tar -xf - -C '${REMOTE_DIR}/${subdir}'"
}

sync_dist_dir client
sync_dist_dir server

echo "==> docker deploy (prebuilt, no Vite)"
"${SSH[@]}" "${USER_NAME}@${HOST}" \
  "set -euo pipefail
   cd '${REMOTE_DIR}'
   export APP_DOCKERFILE=Dockerfile.prebuilt
   bash scripts/lightsail-deploy.sh
   echo '==> version'
   curl -sS -m 20 https://staging.swimit.co.in/api/version || true
   echo
  "

echo "==> Done. Confirm /api/version commit matches the Expected commit above."
echo "==> Open https://staging.swimit.co.in"
