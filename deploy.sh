#!/usr/bin/env bash
# deploy.sh — Build Angular and sync everything to Apache document root.
#
# Usage (run from project root on your local machine):
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Or deploy to a remote server:
#   DEPLOY_HOST=user@yourserver.com DEPLOY_PATH=/var/www/html/beanbag DEPLOY_API_PATH=/var/www/beanbag-api ./deploy.sh

set -e

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/html/beanbag-bracket}"
DEPLOY_API_PATH="${DEPLOY_API_PATH:-/var/www/html/beanbag-bracket-api}"

echo "==> Building Angular (production)..."
cd frontend
npm ci --silent
npm run build:prod
cd ..

echo "==> Build complete: dist/browser/"

if [ -n "$DEPLOY_HOST" ]; then
  echo "==> Deploying frontend to $DEPLOY_HOST:$DEPLOY_PATH ..."
  rsync -avz --delete dist/browser/ "$DEPLOY_HOST:$DEPLOY_PATH/"

  echo "==> Deploying API to $DEPLOY_HOST:$DEPLOY_API_PATH ..."
  rsync -avz --delete --exclude='config/database.php' api/ "$DEPLOY_HOST:$DEPLOY_API_PATH/"

  echo "==> Done. Remember to:"
  echo "    1. Set credentials in $DEPLOY_API_PATH/config/database.php"
  echo "    2. Ensure Apache serves the app from /bags and the API from /bags/api"
else
  echo ""
  echo "==> Local build only (no DEPLOY_HOST set)."
  echo "    To deploy, set DEPLOY_HOST=user@server and re-run."
  echo "    Or manually copy dist/browser/ and api/ to your Apache server."
fi
