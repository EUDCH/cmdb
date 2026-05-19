#!/usr/bin/env bash
#
# /opt/cmdb/bootstrap.sh — one-time VM bootstrap for cmdb.edch.eu.
#
# Idempotent: safe to re-run. Touches only the things ADR-0004 lists as
# "lives on the VM": the /opt/cmdb tree, the `docker` group membership
# of the deploy user, the GHCR read-only login, and a firewall opening
# for ports 80/443 if ufw is active.
#
# Pre-requisites (must exist before this script runs):
#   - Docker Engine + Compose v2 installed (`docker compose version` works)
#   - The deploy user (default `ubuntu`) has sudo access
#   - /opt/cmdb/.env populated by the operator out-of-band (POSTGRES_PASSWORD,
#     ACME_EMAIL, SESSION_SECRET, GHCR_USER, GHCR_TOKEN, DOMAIN)
#   - /opt/cmdb/docker-compose.yml + /opt/cmdb/Caddyfile rsync'd from a
#     maintainer workstation (this repo's infra/vm/)

set -euo pipefail

APP_DIR="/opt/cmdb"
DEPLOY_USER="${SUDO_USER:-${USER}}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "[bootstrap] must run as root (use sudo)"
  exit 1
fi

echo "[bootstrap] deploy user: ${DEPLOY_USER}"

echo "[bootstrap] ensuring directory tree under ${APP_DIR}"
install -d -o "${DEPLOY_USER}" -g "${DEPLOY_USER}" -m 0755 "${APP_DIR}"

echo "[bootstrap] checking docker group membership for ${DEPLOY_USER}"
if id -nG "${DEPLOY_USER}" | grep -qw docker; then
  echo "[bootstrap]   already in docker group"
else
  usermod -aG docker "${DEPLOY_USER}"
  echo "[bootstrap]   added to docker group (logout/login required for the change to take effect for interactive shells)"
fi

if [[ ! -f "${APP_DIR}/.env" ]]; then
  echo "[bootstrap] FAIL: ${APP_DIR}/.env missing — copy infra/vm/.env.example, fill in values, mode 0600, owner ${DEPLOY_USER}:${DEPLOY_USER}"
  exit 1
fi

# shellcheck disable=SC1091
set -a
source "${APP_DIR}/.env"
set +a

if [[ -z "${GHCR_USER:-}" || -z "${GHCR_TOKEN:-}" ]]; then
  echo "[bootstrap] FAIL: GHCR_USER and GHCR_TOKEN must be set in ${APP_DIR}/.env (read-only PAT scoped to read:packages)"
  exit 1
fi

echo "[bootstrap] logging into ghcr.io as ${GHCR_USER}"
# Use --password-stdin so the token never lands in shell history.
echo "${GHCR_TOKEN}" | sudo -u "${DEPLOY_USER}" docker login ghcr.io \
  --username "${GHCR_USER}" --password-stdin

if [[ ! -f "${APP_DIR}/seed.local.ts" ]]; then
  echo "[bootstrap] creating placeholder seed.local.ts so the seed-profile bind-mount has a target"
  cat > "${APP_DIR}/seed.local.ts" <<'PLACEHOLDER'
// Placeholder. Real EDCH inventory seed is copied to /opt/cmdb/seed.local.ts
// out-of-band by the operator; the seed compose profile bind-mounts this
// file into the cmdb image at /app/db/seed.local.ts.
console.log("seed.local.ts placeholder — no real inventory loaded.");
PLACEHOLDER
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/seed.local.ts"
  chmod 0640 "${APP_DIR}/seed.local.ts"
fi

# Firewall: open 80/443 if ufw is active. Skip silently if ufw isn't installed.
if command -v ufw >/dev/null && ufw status | grep -qw active; then
  echo "[bootstrap] ufw active — ensuring 80/tcp + 443/tcp + 443/udp open"
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
else
  echo "[bootstrap] ufw not active — skipping firewall step"
fi

echo "[bootstrap] done"
echo "[bootstrap] next: copy infra/vm/docker-compose.yml + Caddyfile to ${APP_DIR}/, then trigger the deploy workflow"
