#!/bin/sh
set -eu

cd /app

echo "==> SwimIT: initializing database schema"
npm run db:init:prod -w server

echo "==> SwimIT: starting server on port ${PORT:-4000}"
exec npm run start -w server
