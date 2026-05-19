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
HEALTH_URL="http://127.0.0.1/health"
HEALTH_TIMEOUT=60   # seconds to wait for /health 200 before rollback

cd "${APP_DIR}"

echo "[deploy] tag=${TAG}"
echo "[deploy] previous IMAGE_TAG (from .env if set):"
grep -E "^IMAGE_TAG=" .env || echo "  (none)"

# Persist the new tag into .env so a manual `docker compose pull` or a
# VM reboot picks the same image we just deployed.
if grep -qE "^IMAGE_TAG=" .env; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" .env
else
  echo "IMAGE_TAG=${TAG}" >> .env
fi

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
  echo "[deploy] rollback hint: re-run with the previous tag once migrate is fixed:"
  echo "[deploy]   /opt/cmdb/deploy.sh <previous-sha>"
  exit 1
fi

echo "[deploy] migrate ok — swapping cmdb container"
docker compose up -d --no-deps cmdb

# Poll /health from inside the VM (the caddy container reverse-proxies
# to the cmdb container on the private bridge). We probe via the public
# caddy listener so a TLS / vhost regression also surfaces here.
echo "[deploy] polling ${HEALTH_URL} (timeout ${HEALTH_TIMEOUT}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
while true; do
  http_code=$(curl -sk -o /dev/null -w "%{http_code}" -H "Host: ${DOMAIN:-cmdb.edch.eu}" "${HEALTH_URL}" || echo "000")
  if [[ "${http_code}" == "200" ]]; then
    echo "[deploy] /health 200 — deploy verified"
    docker compose up -d --remove-orphans
    docker image prune -f --filter "label=org.opencontainers.image.source=https://github.com/EUDCH/cmdb" >/dev/null || true
    echo "[deploy] done"
    exit 0
  fi
  if (( $(date +%s) > deadline )); then
    echo "[deploy] FAIL: /health did not return 200 within ${HEALTH_TIMEOUT}s (last HTTP ${http_code})"
    echo "[deploy] rollback hint: re-run with the previous tag:"
    echo "[deploy]   /opt/cmdb/deploy.sh <previous-sha>"
    exit 1
  fi
  sleep 2
done
