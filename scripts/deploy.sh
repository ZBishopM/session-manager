#!/usr/bin/env bash
#
# Deploys the static frontend, generated PocketBase migrations and hooks
# to the production VPS, then restarts PocketBase.
#
# Required env vars:
#   VPS_HOST       — hostname or IP of the target VPS
#   VPS_USER       — ssh user (default: sessionmgr)
#   VPS_APP_DIR    — remote dir to deploy into (default: /home/sessionmgr/app)
#
# Required server-side state (one-time setup, see docs/DEPLOYMENT.md):
#   - User exists with the given name
#   - $VPS_APP_DIR/{frontend,pb_hooks,pb_migrations} dirs exist
#   - PocketBase is running under PM2 as "session-manager-pb"
#     (pm2 start ./pocketbase -- serve ..., see docs/DEPLOYMENT.md §6)
#
# Designed to run unchanged from a developer laptop or a GitHub Action
# (with an ssh-agent loaded with the deploy key).

set -euo pipefail

VPS_HOST=${VPS_HOST:?VPS_HOST is required}
VPS_USER=${VPS_USER:-ubuntu}
VPS_APP_DIR=${VPS_APP_DIR:-/home/ubuntu/session-manager}

REMOTE="${VPS_USER}@${VPS_HOST}"

echo "[deploy] regenerating migrations / hooks / types from manifest"
npm run build:migrations >/dev/null
npm run build:hooks >/dev/null
npm run build:types >/dev/null

echo "[deploy] building frontend (adapter-static)"
npm run build >/dev/null

echo "[deploy] syncing artifacts to ${REMOTE}:${VPS_APP_DIR}"
rsync -az --delete --info=progress2 build/             "${REMOTE}:${VPS_APP_DIR}/frontend/"
rsync -az --delete --info=progress2 pb_hooks/          "${REMOTE}:${VPS_APP_DIR}/pb_hooks/"
rsync -az --delete --info=progress2 pb_migrations/     "${REMOTE}:${VPS_APP_DIR}/pb_migrations/"

echo "[deploy] restarting pocketbase"
ssh "${REMOTE}" 'pm2 restart session-manager-pb'

echo "[deploy] done"
