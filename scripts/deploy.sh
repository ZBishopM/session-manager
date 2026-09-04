#!/usr/bin/env bash
#
# Deploys the static frontend, generated PocketBase migrations and hooks
# to the production VPS, then restarts PocketBase.
#
# Required env vars:
#   VPS_HOST       — hostname or IP of the target VPS
#   VPS_USER       — ssh user (default: bicho)
#   VPS_APP_DIR    — remote dir to deploy into (default: /var/www/session-manager)
#
# Required server-side state (one-time setup, see docs/DEPLOYMENT.md):
#   - User exists with the given name
#   - $VPS_APP_DIR/{build,pb/pb_hooks,pb/pb_migrations} dirs exist
#     (PocketBase's binary+cwd live in $VPS_APP_DIR/pb — no --hooksDir/
#     --migrationsDir flags on the running process, so it reads pb_hooks/
#     and pb_migrations/ relative to its own cwd, nested one level under
#     the app dir rather than siblings of it. nginx serves the frontend
#     straight out of $VPS_APP_DIR/build. Confirmed 2026-09-02 by SSH
#     recon of the actual running pm2 process — these paths previously
#     didn't match reality; see pendientes/gamesessions.md for how that
#     was found.)
#   - PocketBase is running under PM2 as "session-manager-pb"
#     (pm2 start ./pocketbase -- serve ..., see docs/DEPLOYMENT.md §6)
#
# Designed to run unchanged from a developer laptop or a GitHub Action
# (with an ssh-agent loaded with the deploy key). Needs rsync — on a
# Windows dev machine without it, do the equivalent by hand with scp
# (rm -rf a staging dir, scp -r into it, then swap on the remote) rather
# than running this script directly.

set -euo pipefail

VPS_HOST=${VPS_HOST:?VPS_HOST is required}
VPS_USER=${VPS_USER:-bicho}
VPS_APP_DIR=${VPS_APP_DIR:-/var/www/session-manager}

REMOTE="${VPS_USER}@${VPS_HOST}"

echo "[deploy] regenerating migrations / hooks / types from manifest"
pnpm run build:migrations >/dev/null
pnpm run build:hooks >/dev/null
pnpm run build:types >/dev/null

echo "[deploy] building frontend (adapter-static)"
pnpm run build >/dev/null

echo "[deploy] syncing artifacts to ${REMOTE}:${VPS_APP_DIR}"
rsync -az --delete --info=progress2 build/             "${REMOTE}:${VPS_APP_DIR}/build/"
rsync -az --delete --info=progress2 pb_hooks/          "${REMOTE}:${VPS_APP_DIR}/pb/pb_hooks/"
rsync -az --delete --info=progress2 pb_migrations/     "${REMOTE}:${VPS_APP_DIR}/pb/pb_migrations/"

echo "[deploy] restarting pocketbase"
ssh "${REMOTE}" 'pm2 restart session-manager-pb'

echo "[deploy] done"
