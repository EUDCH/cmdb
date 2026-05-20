#!/usr/bin/env bash
#
# /opt/cmdb/deploy.sh — invoked by the GitHub Actions deploy workflow via
# SSH after a successful build + GHCR push. Also safe to run manually for
# a rollback:
#
#   /opt/cmdb/deploy.sh <previous-sha>
#
# Per ADR-0004 the docker socket never leaves the VM; the workflow's only
# remote action is `ssh ubuntu@cmdb-vm /opt/cmdb/deploy.sh <tag>`.

set -euo pipefail

TAG="${1:-main}"
APP_DIR="/opt/cmdb"
HEALTH_TIMEOUT=90   # seconds to wait for /health 200 before rollback

cd "${APP_DIR}"

# Source .env so DOMAIN (and friends) are available to this script's own
# probe. The compose CLI reads .env automatically for service interpolation,
# but this script also needs DOMAIN for the HTTPS health probe below.
if [[ ! -f .env ]]; then
  echo "[deploy] FAIL: ${APP_DIR}/.env missing — run bootstrap.sh first"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source ./.env
set +a

DOMAIN="${DOMAIN:?DOMAIN must be set in /opt/cmdb/.env}"
HEALTH_URL="https://${DOMAIN}/health"

# Capture the currently-deployed tag so we can roll it back in .env if
# this deploy fails after we've started touching state. The .env value
# only gets rewritten after /health 200 confirms the new image works.
PREV_TAG=""
if grep -qE "^IMAGE_TAG=" .env; then
  PREV_TAG="$(grep -E "^IMAGE_TAG=" .env | head -1 | cut -d= -f2-)"
fi

echo "[deploy] tag=${TAG} prev=${PREV_TAG:-(none)}"

# IMAGE_TAG is exported only for compose pull/run below; the .env file
# stays untouched until the new tag is verified healthy.
export IMAGE_TAG="${TAG}"

echo "[deploy] pulling ghcr.io/eudch/cmdb:${TAG}"
docker compose pull cmdb migrate

# Run the one-shot migrate first. compose's
# `depends_on: service_completed_successfully` covers `up`-driven runs,
# but invoking the migrate service explicitly lets us surface a non-zero
# exit before touching the app container at all.
echo "[deploy] running migrations"
if ! docker compose run --rm migrate; then
  echo "[deploy] FAIL: migrate exited non-zero"
  echo "[deploy] previous cmdb container is still serving; no swap performed"
  echo "[deploy] .env still pinned at IMAGE_TAG=${PREV_TAG:-(unset)}"
  echo "[deploy] rollback hint: re-run with the previous tag once migrate is fixed:"
  echo "[deploy]   /opt/cmdb/deploy.sh <previous-sha>"
  exit 1
fi

echo "[deploy] migrate ok — swapping cmdb container"
docker compose up -d --no-deps cmdb

# Poll /health via the public caddy listener so a TLS or vhost regression
# also surfaces here. `--resolve` pins the DNS lookup to the local caddy
# instance so the probe works even when public DNS hasn't propagated yet,
# without disabling TLS verification (no `-k`).
echo "[deploy] polling ${HEALTH_URL} (timeout ${HEALTH_TIMEOUT}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
last_code="000"
while true; do
  last_code=$(curl -s -o /dev/null -w "%{http_code}" \
    --resolve "${DOMAIN}:443:127.0.0.1" \
    "${HEALTH_URL}" || echo "000")
  if [[ "${last_code}" == "200" ]]; then
    echo "[deploy] /health 200 — deploy verified"
    # Only now persist the new tag so a manual `docker compose pull` or a
    # VM reboot picks the verified image, not an unverified rollback target.
    if grep -qE "^IMAGE_TAG=" .env; then
      sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" .env
    else
      echo "IMAGE_TAG=${TAG}" >> .env
    fi
    docker compose up -d --remove-orphans
    docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/EUDCH/cmdb" >/dev/null || true
    echo "[deploy] done"
    exit 0
  fi
  if (( $(date +%s) > deadline )); then
    echo "[deploy] FAIL: /health did not return 200 within ${HEALTH_TIMEOUT}s (last HTTP ${last_code})"
    echo "[deploy] .env still pinned at IMAGE_TAG=${PREV_TAG:-(unset)}"
    echo "[deploy] rollback hint: re-run with the previous tag:"
    echo "[deploy]   /opt/cmdb/deploy.sh <previous-sha>"
    exit 1
  fi
  sleep 2
done
