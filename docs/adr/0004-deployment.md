# ADR-0004 — Deployment Topology and Pipeline

**Status:** Accepted

**Date:** 2026-05-18

## Context

The application is built and tested in CI but is not deployed anywhere. The target host (`cmdb.edch.eu`, IN2P3 Strasbourg, Ubuntu 24.04 LTS) holds only an OS and a DNS entry. Without a deployment story every feature merged to `main` is a feature nobody outside this repo can see or use, and the project cannot move from "scaffolded" to "operationally useful".

Constraints driving the choice:

- **Single VM**, no external reverse proxy in front, no managed Postgres, no co-located OPERAS services to rely on. The stack must be self-contained on that one host except for the OPERAS ID IdP (deferred — see § Phase 1 vs Phase 2 below).
- **TLS terminates on-box.** Ports 80 + 443 reach the public internet so HTTP-01 challenges succeed.
- **Solo maintainer; handover-ready or it's not done.** `docs/HANDOVER.md` is the falsification test — a new sysadmin should be able to deploy, operate, and recover from that file alone (per ADR-0001's load-bearing reason).
- **No vendor lock.** Same MIT/BSD/Apache discipline as the rest of the stack.
- **AGENTS.md change ceremony applies.** Every change ships via PR with green CI, including the deployment artifacts themselves.
- **Real EDCH inventory must NOT enter git.** Same constraint as `db/seed.local.ts` (anti-pattern in AGENTS.md). The seeding mechanism cannot rely on committed data.

## Decision

| Concern | Choice |
| --- | --- |
| Container registry | [**GHCR**](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry) — `ghcr.io/eudch/cmdb:<sha>` + `ghcr.io/eudch/cmdb:main`, pushed by the workflow under the built-in `GITHUB_TOKEN` (no PAT). VM pulls with a read-only PAT installed once. |
| Build pipeline | New `.github/workflows/deploy.yml` triggers on `push: { branches: [main] }` and `workflow_dispatch`. Build uses the existing multi-stage `Dockerfile` (already covered by hadolint in `ci.yml`). |
| Deploy mechanism | Workflow `ssh`es to the VM as `ubuntu` and invokes `/opt/cmdb/deploy.sh <tag>`. **Docker socket is never exposed to the network.** Deploy logic lives in a version-controlled script on the VM, not in workflow YAML. |
| Runtime stack | `docker compose` v2 with four services on a private bridge network: `caddy` (TLS, reverse proxy), `postgres:17-alpine` (named volume), `migrate` (one-shot), `cmdb` (the app image). |
| Migration ordering | `cmdb` declares `depends_on: { migrate: { condition: service_completed_successfully } }`. A failed migration **blocks** the app swap; the previous container keeps serving. |
| Reverse proxy / TLS | [**Caddy 2**](https://caddyserver.com/) over Nginx / Traefik. Zero-config Let's Encrypt + HTTP/3, minimal `Caddyfile`. Cert + config persist in named volumes (`caddy-data`, `caddy-config`). |
| Postgres location | Same compose stack as the app. Named Docker volume for the data directory. Postgres is **not** published on the host network; only the app container reaches it via the user-defined bridge. |
| Secrets | `/opt/cmdb/.env` (root:root, 600). Operator copies from `infra/vm/.env.example` and fills values out-of-band. Never in git, never in repo `secrets.*` except for the SSH deploy key + pinned `known_hosts`. |
| Seeding real EDCH inventory | Profile-gated `seed` service in the compose file. Operator `scp`s their local `db/seed.local.ts` to `/opt/cmdb/seed.local.ts` (bind-mounted into the container) and runs `docker compose --profile seed run --rm seed` once on first deploy. The real inventory never enters the repo. |
| Authentication (Phase 1) | `AUTH_MODE=dev` per ADR-0003's dev-mode contract. The red "DEV AUTH — NO PRODUCTION USE" banner is the safeguard. OIDC against OPERAS ID is **Phase 2** (separate ADR will be filed when the OPERAS ID client is registered). |
| Deploy user | `ubuntu` (existing account, added to the `docker` group). A dedicated `deploy` user with narrowed sudoers is a deferred hardening — the `deploy.sh` contract is identical either way, so the migration is one-time and low-risk. |
| Trigger evolution | **Phase 1:** `push: { branches: [main] }`. **Phase 1.5** (once feature velocity slows and stability matters more than freshness): swap the `on:` block to `release: { types: [published] }`. `workflow_dispatch` survives both phases for manual rollbacks. |
| Health probe | New SSR route `GET /health` returns a JSON body with `status`, `version` (commit SHA), and `db` (one of `ok` or `down`). HTTP 200 when healthy, 503 when the DB is unreachable. `deploy.sh` polls it after `up -d cmdb` and prints a rollback hint on failure. |
| Rollback | `CMDB_TAG=<prev-sha> docker compose up -d cmdb` — the previous image stays pullable from GHCR indefinitely. Documented in `docs/HANDOVER.md`. |

## Why not …

- **Path B (SSH + `git pull` + `bun run build` + `systemctl restart`):** simpler conceptually, no registry needed. Rejected because (a) the build happens on the VM (heavier resource footprint, drift risk between CI build env and prod build env), (b) rollback requires re-checking out a prior commit and re-building (slow, error-prone), (c) the deployed tree mutates in place. The immutable-image story is worth the upfront cost.
- **Self-hosted container registry (Harbor, Distribution, Forgejo container registry on `forge.bapt.name`):** another service to monitor, back up, and rotate creds for. GHCR is free for public namespaces, integrates natively with `GITHUB_TOKEN`, and matches the repo's public visibility.
- **Workflow runs `docker` against a remote daemon (TLS-protected Docker socket on the VM):** exposes a high-value attack surface to the public internet. SSH with a deploy key is the standard answer; the docker socket never leaves the VM.
- **Nginx as reverse proxy:** wins on configurability for complex routing; irrelevant for a single upstream. Caddy's zero-config Let's Encrypt is a meaningful operational simplification.
- **Traefik as reverse proxy:** wins on dynamic Docker label discovery; overkill for a four-service stack where the topology rarely changes.
- **Bind-mount the Postgres data directory** (`./postgres-data:/var/lib/postgresql/data`): forces UID-mapping gymnastics (host vs container postgres UID), complicates backup tooling, and exposes the data path directly in the host filesystem. Named volume keeps it Docker-managed; backup tooling reads from a running container via `pg_dump`, not from the raw files.
- **Compose `restart: always` everywhere:** masks broken containers in a restart loop. `restart: unless-stopped` for app + caddy + postgres; `restart: no` for the one-shot `migrate` so a failed migration is visible, not silently retried.
- **Push real EDCH inventory into a private `seed.prod.ts` in the repo with `.gitignore` covering it:** still mixes inventory + code lifecycle, and a single misconfigured `.gitignore` leaks the lot. Out-of-band copy with a bind-mount is one fewer thing to get wrong.

## Phase 1 vs Phase 2

| Concern | Phase 1 (this ADR) | Phase 2 (separate ADR) |
| --- | --- | --- |
| Authentication | `AUTH_MODE=dev`, red dev banner | OIDC against OPERAS ID per ADR-0003 |
| Trigger | `push: { branches: [main] }` | `release: { types: [published] }` |
| Backups | Documented `pg_dump` runbook only | Automated snapshot + off-site rotation |
| Monitoring | Caddy + app container logs via `docker compose logs` | HetrixTools probe of `/health` + Loki / Promtail / Grafana |
| Deploy user | `ubuntu` (in `docker` group) | Dedicated `deploy` user with narrow sudoers |
| Multi-instance | No — single VM, single container | Out of current scope |

Phase 2 work is filed as separate ADRs when it lands. The compose stack, deploy script, and workflow shape are designed so each Phase-2 transition is a small additive change, not a rewrite.

## Consequences

**Positive:**

- Deploy is a `git push` (or a `gh workflow run` for manual rollbacks).
- Rollback is one `docker compose` invocation against a prior GHCR tag.
- The VM holds zero application source — only configuration and persistent state. A VM rebuild is `bootstrap.sh` + `scp` of `.env` + first deploy.
- The migration gate prevents a half-applied schema landing under a live app.
- Real EDCH inventory stays out of git by construction (profile-gated seed service + out-of-band copy).
- Phase 2 (OIDC, backups, monitoring) layers on the same stack without re-doing the foundation.

**Negative:**

- GHCR pull from the VM requires a read-only PAT installed once (`~ubuntu/.docker/config.json` with `docker login ghcr.io`). One credential to rotate periodically.
- Caddy's automatic certificate management depends on ports 80 + 443 staying open; an upstream firewall change at IN2P3 could break renewals silently if not monitored. HetrixTools probe of `/health` (Phase 2) catches this; until then the renewal failure surfaces as an expired cert ~60 days after issuance.
- The dev-mode banner means the site is openly readable + writable for the duration of Phase 1. Acceptable while the inventory is non-sensitive and the URL is not yet advertised; Phase 2 closes this gap.
- Postgres data lives on a Docker named volume on the VM's local disk. Without Phase 2 backups, a VM failure between snapshots loses inventory data. The pre-Phase-2 mitigation is the documented `pg_dump` runbook + operator discipline.

**Neutral:**

- Locks the project into Docker / Compose v2 on the deploy host. Compose v2 is bundled with current Docker Engine; no separate install. Migration to Kubernetes / Nomad / similar is a different ADR if the project ever outgrows a single VM.

## Notes

- The runtime port inside the container stays `4321` (matches the existing Dockerfile). Caddy is the only thing the public internet sees.
- The Dockerfile (already in the repo, already hadolint-clean) is the build artifact. No build-args, no per-environment image variants — same image runs in CI smoke tests, in local dev (if you point `docker compose` at it), and in production.
- The `infra/vm/` tree introduced by the implementation PR carries every file that lands on the VM: `bootstrap.sh`, `docker-compose.yml`, `Caddyfile`, `deploy.sh`, `.env.example`. Files are rsync'd from a maintainer workstation; the VM never holds the source tree.
- The implementation PR's description carries the per-file acceptance checklist (what each file must contain, which probes prove it). That checklist is the equivalent of acceptance tests for the deployment artifacts themselves; it lives in the PR rather than as a long-lived doc because once the PR merges, the artifacts themselves are the source of truth.
- This ADR replaces the placeholder "Example PaaS" language in ADR-0001 § Decision and ADR-0001 § Notes (the deployment row and the open-questions list there). ADR-0001 stays accepted; this ADR resolves its open deployment questions.
- HANDOVER's Deployment / Secrets / Backup & Restore / Runbook sections fill in alongside the implementation PR (they document what gets built).
