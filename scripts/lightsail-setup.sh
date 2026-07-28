#!/bin/bash
# Run once on a fresh Ubuntu Lightsail instance (as ubuntu or root with sudo).
# Usage: curl/bash after cloning, or:
#   bash scripts/lightsail-setup.sh

set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "==> Updating packages"
$SUDO apt-get update -y
$SUDO apt-get upgrade -y

echo "==> Installing Docker"
$SUDO apt-get install -y ca-certificates curl gnupg
$SUDO install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | $SUDO tee /etc/apt/keyrings/docker.asc >/dev/null
  $SUDO chmod a+r /etc/apt/keyrings/docker.asc
fi
ARCH="$(dpkg --print-architecture)"
CODENAME="$(. /etc/os-release && echo "${VERSION_CODENAME}")"
echo "deb [arch=${ARCH} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  | $SUDO tee /etc/apt/sources.list.d/docker.list >/dev/null
$SUDO apt-get update -y
$SUDO apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin git

if id -u ubuntu >/dev/null 2>&1; then
  $SUDO usermod -aG docker ubuntu || true
fi
if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
  $SUDO usermod -aG docker "$SUDO_USER" || true
fi

echo "==> Docker installed. Log out/in (or newgrp docker) so docker works without sudo."
echo "Next:"
echo "  1. Clone repo to /opt/swimit (or ~/swimit)"
echo "  2. cp .env.lightsail.example .env && edit DOMAIN + passwords"
echo "  3. bash scripts/lightsail-deploy.sh"
