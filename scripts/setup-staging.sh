#!/bin/bash
# First-time SwimIT staging setup (postgres + systemd + nginx).
# Usage: sudo bash /var/www/swimit/scripts/setup-staging.sh
#
# Set these before running (required for a real host):
#   STAGING_HOST=your-staging-hostname
# Optional:
#   APP_DIR  STAGING_PORT  STAGING_DB  STAGING_DB_USER  STAGING_DB_PASS

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/swimit}"
STAGING_PORT="${STAGING_PORT:-4010}"
STAGING_HOST="${STAGING_HOST:-}"
STAGING_API_UNIT="${STAGING_API_UNIT:-swimit-api-staging}"
STAGING_DB="${STAGING_DB:-swimit_staging}"
STAGING_DB_USER="${STAGING_DB_USER:-swimit}"
STAGING_DB_PASS="${STAGING_DB_PASS:-swimit_staging_change_me}"
NODE_BIN="${NODE_BIN:-$(command -v node)}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

if [ -z "$STAGING_HOST" ]; then
  echo "Set STAGING_HOST to your SwimIT staging domain, e.g.:"
  echo "  sudo STAGING_HOST=staging.swimit.example.com bash $0"
  exit 1
fi

echo "==> ensure postgres role/db"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${STAGING_DB_USER}') THEN
    CREATE ROLE ${STAGING_DB_USER} LOGIN PASSWORD '${STAGING_DB_PASS}';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE ${STAGING_DB} OWNER ${STAGING_DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${STAGING_DB}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${STAGING_DB} TO ${STAGING_DB_USER};
SQL

ENV_FILE="$APP_DIR/server/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "==> writing $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
PORT=${STAGING_PORT}
DATABASE_URL=postgresql://${STAGING_DB_USER}:${STAGING_DB_PASS}@127.0.0.1:5432/${STAGING_DB}
CORS_ORIGIN=https://${STAGING_HOST}
EOF
  chmod 600 "$ENV_FILE"
else
  echo "==> keeping existing $ENV_FILE"
fi

UNIT_FILE="/etc/systemd/system/${STAGING_API_UNIT}.service"
echo "==> writing $UNIT_FILE"
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=SwimIT API (staging)
After=network.target postgresql.service

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/server
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${APP_DIR}/server/dist/index.js
Restart=on-failure
RestartSec=3
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
EOF

chown -R www-data:www-data "$APP_DIR" || true
mkdir -p "$APP_DIR/server/uploads"
chown -R www-data:www-data "$APP_DIR/server/uploads"

systemctl daemon-reload
systemctl enable "$STAGING_API_UNIT"

NGINX_SITE="/etc/nginx/sites-available/swimit-staging"
echo "==> writing $NGINX_SITE"
cat > "$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name ${STAGING_HOST};

    client_max_body_size 10m;

    location /uploads/ {
        proxy_pass http://127.0.0.1:${STAGING_PORT}/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:${STAGING_PORT}/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:${STAGING_PORT}/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sfn "$NGINX_SITE" /etc/nginx/sites-enabled/swimit-staging
nginx -t
systemctl reload nginx

echo "==> build + start"
sudo -u www-data bash -lc "cd '$APP_DIR' && npm install && npm run build && npm run db:init" || {
  echo "WARN: build as www-data failed — sync code, then run deploy-on-staging.sh"
}

systemctl restart "$STAGING_API_UNIT" || true

echo ""
echo "Setup complete."
echo "  App dir:  $APP_DIR"
echo "  Host:     https://${STAGING_HOST}"
echo "  API unit: $STAGING_API_UNIT  (port ${STAGING_PORT})"
echo "  DB:       $STAGING_DB"
echo ""
echo "Next: sync code to $APP_DIR, then:"
echo "  SKIP_GIT_PULL=1 bash $APP_DIR/scripts/deploy-on-staging.sh"
echo "TLS (if certbot is available): sudo certbot --nginx -d ${STAGING_HOST}"
