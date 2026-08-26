#!/bin/bash
# Deploy SwimIT production from your PC to Lightsail (app.swimit.co.in):
#   1) build client+server locally (Vite never runs on Lightsail)
#   2) git pull (or clone) on the server
#   3) rsync dist folders
#   4) docker compose with Dockerfile.prebuilt
#
# Prerequisites (one-time):
#   1. Create a Mumbai Lightsail instance (see comments below).
#   2. Download the instance SSH key. Save e.g. as:
#        ~/.ssh/swimit-prod.pem
#      chmod 600 ~/.ssh/swimit-prod.pem
#   3. Attach a static IP and point DNS:
#        app.swimit.co.in  A  <static-ip>
#   4. Set the public IP:
#        export SWIMIT_PROD_HOST=x.x.x.x
#
# Usage (from PC, repo root):
#   export SWIMIT_PROD_HOST=x.x.x.x
#   bash scripts/deploy-prod-from-pc.sh
#   bash scripts/deploy-prod-from-pc.sh ~/.ssh/swimit-prod.pem

set -euo pipefail

HOST="${SWIMIT_PROD_HOST:-}"
USER_NAME="${SWIMIT_PROD_USER:-ubuntu}"
REMOTE_DIR="${SWIMIT_REMOTE_DIR:-/opt/swimit}"
KEY="${1:-${SWIMIT_PROD_SSH_KEY:-${SWIMIT_SSH_KEY:-$HOME/.ssh/swimit-prod.pem}}}"
GIT_URL="${SWIMIT_GIT_URL:-https://github.com/kgbhagwat/swimit.git}"
DOMAIN="${SWIMIT_PROD_DOMAIN:-app.swimit.co.in}"

KEY="${KEY/#\~/$HOME}"

if [ -z "$HOST" ]; then
  echo "Set the production Lightsail public IP first:"
  echo "  export SWIMIT_PROD_HOST=x.x.x.x"
  echo "  bash scripts/deploy-prod-from-pc.sh"
  echo ""
  echo "Or: SWIMIT_PROD_HOST=x.x.x.x bash scripts/deploy-prod-from-pc.sh /path/to/swimit-prod.pem"
  exit 1
fi

if [ -d /opt/swimit ] && [ -f /opt/swimit/docker-compose.lightsail.yml ]; then
  echo "You are on the Lightsail server. Do NOT run this script here."
  echo "On your Windows PC (Git Bash), from the swimIT repo folder:"
  echo "  export SWIMIT_PROD_HOST=${HOST}"
  echo "  bash scripts/deploy-prod-from-pc.sh"
  exit 1
fi

if [ ! -f "$KEY" ]; then
  echo "SSH key not found: $KEY"
  echo "Download the Lightsail key for the *production* instance (not staging)."
  echo "Example (Windows Git Bash):"
  echo "  bash scripts/deploy-prod-from-pc.sh /c/Users/sneha/.ssh/swimit-prod.pem"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes)
RSYNC_RSH="ssh -i ${KEY} -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes"

echo "==> Deploying production to ${USER_NAME}@${HOST}:${REMOTE_DIR}"
echo "==> Domain: https://${DOMAIN}"
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

echo "==> ensure git repo on server"
"${SSH[@]}" "${USER_NAME}@${HOST}" \
  "set -euo pipefail
   if [ ! -d '${REMOTE_DIR}/.git' ]; then
     sudo mkdir -p '${REMOTE_DIR}'
     sudo chown -R '${USER_NAME}:${USER_NAME}' '${REMOTE_DIR}'
     git clone '${GIT_URL}' '${REMOTE_DIR}'
   fi
   cd '${REMOTE_DIR}'
   git pull --ff-only
   echo 'repo HEAD:'
   git rev-parse HEAD
   git log -1 --oneline
   mkdir -p client/dist server/dist
   if [ ! -f .env ]; then
     echo 'MISSING .env on server — copy .env.lightsail.prod.example to .env and edit passwords.'
     echo '  cd ${REMOTE_DIR} && cp .env.lightsail.prod.example .env && nano .env'
     exit 2
   fi
  "

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

  echo "    (rsync not installed — using tar over SSH)"
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
   curl -sS -m 20 https://${DOMAIN}/api/version || true
   echo
  "

echo "==> Done. Confirm /api/version commit matches the Expected commit above."
echo "==> Open https://${DOMAIN}"
