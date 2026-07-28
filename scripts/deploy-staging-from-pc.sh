#!/bin/bash
# Deploy SwimIT staging from your PC (SSH into Lightsail, then pull + rebuild).
#
# Prerequisites (one-time):
#   1. Download the Lightsail SSH key (Instance → Account → SSH keys, or
#      Connect → Download default key). Save e.g. as:
#        ~/.ssh/swimit-staging.pem
#   2. Restrict permissions (Git Bash / WSL):
#        chmod 600 ~/.ssh/swimit-staging.pem
#   3. Optional: set env vars below, or pass as arguments.
#
# Usage (from PC, repo root or anywhere):
#   bash scripts/deploy-staging-from-pc.sh
#   bash scripts/deploy-staging-from-pc.sh ~/.ssh/swimit-staging.pem
#   SWIMIT_SSH_KEY=~/.ssh/swimit-staging.pem bash scripts/deploy-staging-from-pc.sh

set -euo pipefail

HOST="${SWIMIT_STAGING_HOST:-43.204.61.9}"
USER_NAME="${SWIMIT_STAGING_USER:-ubuntu}"
REMOTE_DIR="${SWIMIT_REMOTE_DIR:-/opt/swimit}"
KEY="${1:-${SWIMIT_SSH_KEY:-$HOME/.ssh/swimit-staging.pem}}"

# Expand ~
KEY="${KEY/#\~/$HOME}"

if [ ! -f "$KEY" ]; then
  echo "SSH key not found: $KEY"
  echo ""
  echo "Download the Lightsail key and save it as that path, or run:"
  echo "  bash scripts/deploy-staging-from-pc.sh /path/to/your-key.pem"
  exit 1
fi

echo "==> Deploying to ${USER_NAME}@${HOST}:${REMOTE_DIR}"
echo "==> Using key: $KEY"

# Show local + origin tip so you can confirm after deploy
if git rev-parse HEAD >/dev/null 2>&1; then
  LOCAL_COMMIT="$(git rev-parse HEAD)"
  LOCAL_SHORT="$(git rev-parse --short HEAD)"
  LOCAL_SUBJ="$(git log -1 --pretty=%s)"
  echo "==> Expected commit (this PC / push to GitHub first if needed):"
  echo "    ${LOCAL_SHORT} ${LOCAL_SUBJ}"
  echo "    ${LOCAL_COMMIT}"
fi

ssh -i "$KEY" \
  -o StrictHostKeyChecking=accept-new \
  -o IdentitiesOnly=yes \
  "${USER_NAME}@${HOST}" \
  "set -euo pipefail
   cd '${REMOTE_DIR}'
   echo '==> git pull'
   git pull --ff-only
   echo '==> repo HEAD after pull:'
   git rev-parse HEAD
   git log -1 --oneline
   echo '==> deploy'
   bash scripts/lightsail-deploy.sh
   echo '==> version'
   curl -sS -m 20 https://staging.swimit.co.in/api/version || true
   echo
  "

echo "==> Done. Confirm /api/version commit matches the Expected commit above."
echo "==> Open https://staging.swimit.co.in"
