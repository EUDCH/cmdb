# Handover

> This document is the **single source of truth** for running the CMDB. If another OPERAS sysadmin needs to take over (planned handover, holiday cover, bus-factor event), everything they need to deploy, operate, and recover the system must be here.

## TL;DR

EDCH CMDB v1 (Phase 1) runs on a single Ubuntu 24.04 VM at `cmdb.edch.eu` (IN2P3 Strasbourg). Deploy is automatic on every merge to `main` via GitHub Actions: build image, push to GHCR, SSH to the VM and run `/opt/cmdb/deploy.sh <sha>`. Caddy 2 terminates TLS on-box. Postgres 17 + the app + a one-shot migrate container run under `docker compose` on a private bridge network. Phase 1 uses `AUTH_MODE=dev` (red dev banner); OIDC + automated backups + monitoring are Phase 2 (separate ADRs).

## Deployment

**Target host:** `cmdb.edch.eu` → `134.158.151.88` (IN2P3 Strasbourg), Ubuntu 24.04 LTS.

**Architecture:** see [`adr/0004-deployment.md`](adr/0004-deployment.md). Four containers on a private bridge — `caddy`, `postgres`, `migrate` (one-shot), `cmdb` — plus an opt-in `seed` profile for loading real inventory.

**Deploy contract:** GitHub Actions builds the multi-stage `Dockerfile`, pushes `ghcr.io/eudch/cmdb:<sha>` + `:main`, then `ssh`es to the VM and invokes `/opt/cmdb/deploy.sh <sha>`. The script pulls the new image, runs `migrate` to completion, swaps the `cmdb` container, polls `/health`, and rolls back on failure. The docker socket never leaves the VM.

**Bootstrap (one-time):**

```sh
# On a maintainer workstation, push infra to the VM. Preserve perms
# so bootstrap.sh + deploy.sh keep their executable bit (rsync default
# `-a` does this; do NOT add `--chmod=F644` — it strips +x).
rsync -av infra/vm/ ubuntu@cmdb.edch.eu:/opt/cmdb/

# On the VM (one-time, after `.env` is filled in out-of-band):
sudo /opt/cmdb/bootstrap.sh
```

`bootstrap.sh` is idempotent: re-running is safe. It adds the deploy user to the `docker` group, ensures `/opt/cmdb/` exists with correct ownership, logs into GHCR with the read-only PAT from `.env`, creates a placeholder `seed.local.ts`, and opens 80/443 in ufw if active.

**First deploy:** trigger the workflow manually from the Actions tab (`workflow_dispatch`). Subsequent deploys ship automatically on `push: main`.

**Rollback:** every prior image stays in GHCR indefinitely. To roll back, SSH to the VM and re-run with the previous SHA:

```sh
ssh cmdb-vm /opt/cmdb/deploy.sh <previous-sha>
```

…or trigger `workflow_dispatch` with the SHA in the `tag` input.

**TLS:** Caddy 2 with automatic Let's Encrypt via HTTP-01. Ports 80 + 443 must stay open to the public internet for renewals. Cert + Caddy state persist in the `cmdb_caddy_data` + `cmdb_caddy_config` named volumes; container restarts do not lose certs.

**Configuration files (on the VM):** `/opt/cmdb/` contains exactly:

- `.env` (secrets, mode `0600`, owner `ubuntu:ubuntu` — the user `docker compose` runs as; root-owned 0600 would block compose from reading it)
- `docker-compose.yml` (mirror of `infra/vm/docker-compose.yml`)
- `Caddyfile` (mirror of `infra/vm/Caddyfile`)
- `bootstrap.sh` (one-time setup — kept for re-runs)
- `deploy.sh` (invoked by CI; rsync'd from `infra/vm/deploy.sh`)
- `seed.local.ts` (operator-supplied, gitignored upstream)

No application source ever lands on the VM. The image carries everything.

**Default branch / deployment branch contract:** `main` is the deployment branch. Phase 1.5 (post-stabilisation) will switch the trigger to `release: { types: [published] }`; `workflow_dispatch` stays in both phases.

## Secrets

No secrets ever live in this repo. The list below names **which** secrets the system needs, **where** the canonical copy lives, and the **rotation cadence**.

- **Database credentials** — `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `DATABASE_URL` in `/opt/cmdb/.env` on the VM (mode 0600). No remote copy; regenerate from the operator's password manager on bootstrap. Rotation: at user change or compromise; no scheduled rotation while user list is the operator only.
- **Session signing key** — `SESSION_SECRET` in `/opt/cmdb/.env`. Generate with `openssl rand -base64 48`. Rotation: annually or on suspected compromise; rotating invalidates all active dev-mode sessions.
- **OIDC client secret** — `OIDC_CLIENT_SECRET` in `/opt/cmdb/.env`. Phase 2 only; blank in Phase 1. Canonical copy lives with the OPERAS ID administrator when the client is registered.
- **GHCR read-only PAT** — `GHCR_USER` + `GHCR_TOKEN` in `/opt/cmdb/.env`. Scope: `read:packages` only. Owned by the maintainer's GitHub account. Rotation: annually (GitHub PAT expiry); set a reminder when issuing.
- **Deploy SSH key** — `DEPLOY_SSH_KEY` + `DEPLOY_KNOWN_HOSTS` + `DEPLOY_USER` + `DEPLOY_HOST` as GitHub Actions repository secrets in the EUDCH org. Generated from a maintainer workstation; private key lives only in the repo's secrets store; pubkey is in `ubuntu@cmdb-vm:~/.ssh/authorized_keys`. Rotation: at maintainer change.
- **Monitor integration tokens** (HetrixTools / Pulsetic / Zabbix): Phase 2. None today.
- **Backup target credentials**: Phase 2. None today (manual `pg_dump` runbook below).

## Backup & Restore

**Phase 1 — manual `pg_dump`:**

```sh
# On the VM, point-in-time snapshot:
docker exec cmdb-postgres pg_dump -U cmdb -Fc -d cmdb \
  > "cmdb-$(date -u +%Y%m%dT%H%M%SZ).pgdump"

# Copy off the VM:
scp ubuntu@cmdb-vm:cmdb-*.pgdump ./backups/
```

Cadence: weekly during Phase 1, ideally driven from a maintainer cron on a separate host. Retention: keep at least 4 weekly snapshots locally; copy the most recent off-host. Phase 2 will replace this with an automated snapshot + off-site rotation per the ADR.

**Restore:**

```sh
# On the target VM (after bootstrap has run and the stack is up):
docker compose stop cmdb migrate
docker exec -i cmdb-postgres pg_restore -U cmdb -d cmdb --clean --if-exists \
  < cmdb-YYYYMMDDTHHMMSSZ.pgdump
docker compose start cmdb
```

**Restore drill (ISC-12 gate):** must be tested before declaring v1 done. Restore the latest snapshot to a freshly bootstrapped VM, verify the four canonical queries return expected counts. Until this drill has passed and is documented under the *Known Gotchas* section below, v1 is not closed.

## Runbook

**Health probe:**

```sh
curl -s https://cmdb.edch.eu/health | jq .
# { "status": "ok", "version": "<commit-sha>", "db": "ok" }
```

**Tail logs:**

```sh
ssh cmdb-vm docker compose -f /opt/cmdb/docker-compose.yml logs -f --tail=200 cmdb
ssh cmdb-vm docker compose -f /opt/cmdb/docker-compose.yml logs -f --tail=200 caddy
```

**Restart the app without redeploying:**

```sh
ssh cmdb-vm docker compose -f /opt/cmdb/docker-compose.yml restart cmdb
```

**Roll back to a prior image:** see *Deployment → Rollback* above.

**Apply migrations only (no app swap):**

```sh
ssh cmdb-vm docker compose -f /opt/cmdb/docker-compose.yml run --rm migrate
```

**Load real EDCH inventory (first deploy only):**

```sh
# On a maintainer workstation with the real inventory file:
scp db/seed.local.ts ubuntu@cmdb-vm:/opt/cmdb/seed.local.ts
ssh cmdb-vm chmod 0640 /opt/cmdb/seed.local.ts
ssh cmdb-vm docker compose -f /opt/cmdb/docker-compose.yml --profile seed run --rm seed
```

The seed file is bind-mounted into the cmdb image at `/app/db/seed.local.ts`; the real inventory never enters the repo or the registry.

**Add a new service entry:** Phase 1 — direct SQL until the edit UI lands.

```sh
ssh cmdb-vm docker exec -it cmdb-postgres psql -U cmdb -d cmdb
-- then INSERT INTO service (...) VALUES (...);
```

**Other ops** (add host, link service↔host, mark retired, query by host / owner): same `psql` path; once the edit UI ships these become point-and-click and this section tightens.

## Monitoring

- **Phase 1:** `caddy` + `cmdb` container logs via `docker compose logs`. No external probe.
- **Phase 2:** HetrixTools probe of `https://cmdb.edch.eu/health`. Loki / Promtail / Grafana once the OPERAS LGTM stack is in place.

## Contacts

- Primary maintainer: Baptiste Grenier (OPERAS Federated Infrastructure Manager, EDCH Technical Coordinator)
- Backup contact: TBD (the named successor / cover person)
- Escalation: OPERAS coordinator (currently Pierre Mounier, role transition in progress)
- VM provider escalation: IN2P3 Strasbourg sysadmin team (via OPERAS coordinator)

## Known Gotchas

> Add entries here as we encounter them. Each entry: short title, what went wrong, the fix.

- **Restore drill** — must be exercised before declaring v1 done; entry will record the first run.
