---
project: cmdb
effort: E4
phase: observe
progress: 0/52
mode: standard
started: 2026-05-18
updated: 2026-05-18
---

# CMDB — Project ISA

> Living system of record for the EDCH Configuration Management Database. Iteration on the project IS iteration on this file. ID-stability rule applies: never re-number ISCs on edit; splits become `ISC-N.M`; drops become tombstones.

## Problem

OPERAS / EDCH has no canonical place to answer questions like *"which services run on which hosts?"*, *"who owns service X?"*, *"if I retire host Y, what breaks?"*, or *"which security contacts do I notify for a coordinated disclosure?"*. The information lives scattered across spreadsheets, individual operator memory, and ad-hoc Google Docs — none of which survive a sysadmin handover and none of which support cross-cuts (filter by lifecycle state, dependency walk, audit trail).

The immediate problem this iteration of the ISA addresses: **the application has no deployment story**. CI builds and tests the codebase, but no image is pushed anywhere, the target VM (`cmdb.edch.eu`, IN2P3 Strasbourg) holds only an OS and a DNS entry, and there is no repeatable, reversible procedure to ship a new version. Without that, every feature merged to `main` is a feature that nobody outside this repo can see or use.

## Vision

A solo OPERAS sysadmin (Baptiste today, a future successor tomorrow) opens `cmdb.edch.eu` in a browser, signs in via OPERAS ID, and immediately sees the live EDCH inventory — services, hosts, owners, security contacts, dependency graph — with full read/write access. Shipping a new version is `git push` (or `git tag`, post-stabilisation): the workflow builds, pushes the image to GHCR, and the VM swaps to the new tag without intervention. Rollback is `docker compose up -d cmdb` with the previous tag. The whole operation is documented end-to-end in `docs/HANDOVER.md` such that another sysadmin can take over with that file alone.

This iteration delivers the deployment substrate. Subsequent iterations layer OIDC (Phase 2), backups, monitoring, RBAC, and the v2 OPERAS namespace on top of the same stack without re-doing the foundation.

## Out of Scope

Declared anti-vision — items deliberately excluded from this iteration, each with a deferred-to pointer.

- **OIDC against OPERAS ID** — deferred to Phase 2. Day 1 ships with `AUTH_MODE=dev` per ADR-0003's dev-mode contract. The red "DEV AUTH — NO PRODUCTION USE" banner is a feature, not a bug, for this phase. Tracked in `## Decisions` D-1.
- **Automatic backups of the Postgres volume** — deferred. Day 1 has a documented `pg_dump` runbook entry only. Daily snapshot to a separate host (IN2P3 backup target or off-site) is its own ISA iteration.
- **Monitoring / alerting integration** — deferred. HetrixTools probe of `/health` may be added by Baptiste out-of-band, but the workflow + compose stack do not provision it.
- **Log aggregation / LGTM stack** — deferred. Day 1 logs are `docker compose logs`. Loki / Promtail / Grafana is a follow-up ISA.
- **OPERAS namespace (v2 multi-tenancy)** — deferred per ADR-0002. The schema already carries `namespace`; UI exposure of multiple namespaces is its own iteration.
- **Multi-instance / horizontal scaling** — Day 1 is a single VM running a single app container. Multi-instance is a stack-design change, not an addition.
- **Auto-seeding real EDCH inventory into prod from a committed file** — forbidden by AGENTS.md anti-patterns ("never push real inventory data"). The real `db/seed.local.ts` is delivered out-of-band via `scp` to `/opt/cmdb/seed.local.ts` and executed via a profile-gated one-shot service.
- **Dedicated deploy user with sudoers narrowing** — Day 1 uses the existing `ubuntu` user per principal directive. Hardening to a `deploy` user with `NOPASSWD: /usr/bin/docker compose -f /opt/cmdb/docker-compose.yml *` is a follow-up if the threat model warrants it.

## Principles

Substrate-independent truths every iteration must respect.

- **Handover-ready or it's not done.** Anything that requires unrecoverable knowledge in one operator's head is a regression. `docs/HANDOVER.md` is the falsification test: a new sysadmin should be able to deploy, operate, and recover from that file alone.
- **The image is the artifact.** Reproducibility lives in the immutable container tag, not in a checked-out git tree on the VM. Rollback is "point at a prior tag", not "find the prior commit and rebuild".
- **Secrets cross the boundary once, by hand.** Production credentials live in `/opt/cmdb/.env` on the VM (root:root 600) and in operator-controlled vaults. They never enter git, never enter repo `secrets.*`, never enter CI environment except as inline placeholders that wouldn't authenticate against anything (the existing CI convention).
- **Migrations gate the swap.** A new image that fails to run its migrations must not replace the previous live container. `service_completed_successfully` is the contract.
- **Anti-criteria are first-class.** "What MUST NOT happen" is named explicitly in the ISC list, not implied.
- **Bun + TypeScript end-to-end** (per AGENTS.md). No npm/yarn/pnpm, no Python for ad-hoc scripts, no JS in app/test code except framework-imposed files.

## Constraints

Immovable architectural mandates this iteration cannot relax.

- **Single VM target.** `cmdb.edch.eu` (134.158.151.88, IN2P3 Strasbourg). Stack must be self-contained on that one host except for the OPERAS ID IdP (Phase 2). DNS is the only external dependency Day 1.
- **TLS terminates on-box.** No upstream OPERAS reverse proxy in front of the VM. Caddy + Let's Encrypt is the TLS authority. Ports 80 + 443 must be reachable from the public internet so HTTP-01 challenges succeed.
- **GHCR is the registry.** No self-hosted registry. The repo is `ghcr.io/eudch/cmdb`. Auth is the workflow's built-in `GITHUB_TOKEN` for push; a read-only GHCR token (PAT) is the VM's pull credential.
- **Deploy via SSH + remote script.** The workflow does not run `docker` against a remote daemon; it `ssh`es to the VM and invokes `/opt/cmdb/deploy.sh`. This keeps the docker socket off the network and the deploy logic version-controlled at the VM.
- **AGENTS.md change ceremony.** Every change ships via PR, CI must be fully green (all four jobs), tests land in the same PR. No direct pushes to `main`. Force-push to feature branches only, `--force-with-lease`.
- **Bun ≥ 1.3.x, Astro SSR, Postgres 17, Drizzle.** Locked by ADR-0001.
- **Namespace at the DB layer.** Locked by ADR-0002.
- **AUTH_MODE defaults to oidc; prod MUST leave it alone — except for this Day 1 phase where it is explicitly `dev` and the banner is the safeguard.** Locked by ADR-0003. The transition to `oidc` is a Phase 2 ISA iteration with its own ISCs.

## Goal

Ship the EDCH CMDB to `cmdb.edch.eu` such that (a) every push to `main` produces a new immutable container image in `ghcr.io/eudch/cmdb`, (b) that image deploys to the VM via a single SSH-triggered script with database migrations gated ahead of the app, (c) Caddy auto-issues and renews a Let's Encrypt certificate for the domain, (d) rolling back to a prior image is a one-line `docker compose` invocation documented in `HANDOVER.md`, and (e) the running site responds 200 on `/health` and renders the existing inventory pages over HTTPS under `AUTH_MODE=dev` with the red dev-mode banner visible.

## Criteria

Atomic ISCs. Each one is a single binary tool probe. ID-stability rule applies.

### Application surface

- [ ] ISC-1: `src/pages/health.ts` (or `.astro`) returns HTTP 200 with `Content-Type: application/json` and a body containing `{"status":"ok","version":"<sha>"}`.
- [ ] ISC-2: `/health` does NOT require a session — middleware allows it under both `AUTH_MODE=dev` and (future) `AUTH_MODE=oidc`.
- [ ] ISC-3: `/health` reports `version` populated from a build-time env var (`PUBLIC_GIT_SHA` or equivalent), not the literal string `unknown`.
- [ ] ISC-4: `/health` probes the database with a `SELECT 1` and includes `{"db":"ok"}` in the body; on DB failure returns 503 with `{"db":"down"}`.
- [ ] ISC-5: Route integration test `tests/routes/health.test.ts` asserts 200 + content-type + shape against the live server, including the DB-up branch.
- [ ] ISC-6: Route integration test asserts the DB-down branch returns 503 (mutate connection, restore via `afterAll`, same shape as the security-contacts empty-state pattern).

### Container image + GHCR

- [ ] ISC-7: `.github/workflows/deploy.yml` exists; triggers are `push: { branches: [main] }` and `workflow_dispatch: { inputs: { tag: { type: string, default: '', description: 'GHCR tag to deploy (default: branch HEAD)' } } }`.
- [ ] ISC-8: The build job uses `docker/build-push-action@v6` (or current major), pushes to `ghcr.io/eudch/cmdb`, tags `:<sha>` AND `:main`, multi-arch limited to `linux/amd64` for now.
- [ ] ISC-9: Build job auths to GHCR via `GITHUB_TOKEN` only; no PAT, no `${{ secrets.GHCR_TOKEN }}`.
- [ ] ISC-10: Image labels include `org.opencontainers.image.source=https://github.com/EUDCH/cmdb`, `revision=<sha>`, `version=<tag-or-sha>` — surfaced via GHCR UI for provenance.
- [ ] ISC-11: `gh release view` after a push to `main` is NOT created — the workflow does not create releases (releases are operator-driven and gate the Phase-2 trigger swap).
- [ ] ISC-12: After a successful main push, the image is pullable: `docker pull ghcr.io/eudch/cmdb:<sha>` succeeds from the VM under the operator-installed GHCR read-only PAT.

### VM bootstrap

- [ ] ISC-13: `infra/vm/bootstrap.sh` exists, is idempotent (re-running on a partially-bootstrapped host completes 0), and installs: Docker Engine, Compose v2, `unattended-upgrades`, `ufw` (or equivalent), and `fail2ban`.
- [ ] ISC-14: Bootstrap script enables firewall rules allowing only 22/tcp (SSH), 80/tcp (HTTP-01), 443/tcp (HTTPS); all other inbound denied.
- [ ] ISC-15: Bootstrap creates `/opt/cmdb/` with subdirs `caddy/`, `postgres-data/`, `caddy-data/`, `caddy-config/`, owned `ubuntu:ubuntu` mode 750.
- [ ] ISC-16: Bootstrap installs `/opt/cmdb/docker-compose.yml`, `/opt/cmdb/Caddyfile`, `/opt/cmdb/deploy.sh`, `/opt/cmdb/.env.example` from `infra/vm/` (rsync from the repo on the operator's workstation, NOT cloned on the VM — the VM never holds the source tree).
- [ ] ISC-17: Bootstrap script's idempotence is verified by a dry-run mode (`bootstrap.sh --dry-run` prints intended actions, exits 0, modifies nothing).
- [ ] ISC-18: Bootstrap does NOT write `/opt/cmdb/.env` — operator copies from `.env.example` and fills secrets out-of-band. Anti-criterion below covers this.

### Production compose stack

- [ ] ISC-19: `infra/vm/docker-compose.yml` defines four services: `caddy`, `postgres`, `migrate`, `cmdb`.
- [ ] ISC-20: `postgres` uses image `postgres:17-alpine`, named volume `postgres-data:/var/lib/postgresql/data`, healthcheck via `pg_isready` interval 5s, restart `unless-stopped`.
- [ ] ISC-21: `migrate` uses the same `ghcr.io/eudch/cmdb:${CMDB_TAG}` image, command `bun run db:migrate`, `depends_on: { postgres: { condition: service_healthy } }`, restart `no`.
- [ ] ISC-22: `cmdb` uses `ghcr.io/eudch/cmdb:${CMDB_TAG}`, `depends_on: { migrate: { condition: service_completed_successfully } }`, expose 4321 (NOT publish), restart `unless-stopped`, healthcheck via `wget --spider http://localhost:4321/health` interval 10s start-period 20s.
- [ ] ISC-23: `caddy` uses `caddy:2-alpine`, publishes 80 + 443, mounts `./Caddyfile:/etc/caddy/Caddyfile:ro`, named volumes for `caddy-data` (cert storage) and `caddy-config`, `depends_on: { cmdb: { condition: service_healthy } }`.
- [ ] ISC-24: A `seed` service exists under `profiles: [seed]` (so it does NOT start with `up -d`), uses the same `cmdb` image, mounts `/opt/cmdb/seed.local.ts:/app/db/seed.local.ts:ro`, command `bun run db:seed:local`. Operator invokes via `docker compose --profile seed run --rm seed`.
- [ ] ISC-25: All services share a single `cmdb` user-defined bridge network; Postgres is NOT exposed on the host network.
- [ ] ISC-26: Compose `version:` field is omitted (Compose v2+ canonical form).

### Caddy + TLS

- [ ] ISC-27: `infra/vm/Caddyfile` defines exactly one site: `cmdb.edch.eu` → `reverse_proxy cmdb:4321`.
- [ ] ISC-28: Caddyfile enables `header { Strict-Transport-Security "max-age=31536000; includeSubDomains" }`.
- [ ] ISC-29: Caddyfile sets `encode zstd gzip`.
- [ ] ISC-30: After first deploy, `curl -I https://cmdb.edch.eu/health` returns 200 with `strict-transport-security` header present and a valid Let's Encrypt certificate (`openssl s_client` shows issuer `Let's Encrypt`).
- [ ] ISC-31: `curl -I http://cmdb.edch.eu/` returns 308 redirect to HTTPS.

### Deploy script + workflow handoff

- [ ] ISC-32: `infra/vm/deploy.sh` (installed at `/opt/cmdb/deploy.sh`) takes one positional arg `TAG`, exits non-zero with usage on missing arg.
- [ ] ISC-33: `deploy.sh` order: (1) write `CMDB_TAG=$TAG` to `/opt/cmdb/.env.tag` (compose `env_file`-included), (2) `docker compose pull cmdb migrate`, (3) `docker compose run --rm migrate` and abort on non-zero exit, (4) `docker compose up -d cmdb` (and caddy/postgres if not running), (5) poll `https://cmdb.edch.eu/health` for HTTP 200 with timeout 60s, (6) on failure print rollback hint: `docker compose --env-file <(echo CMDB_TAG=<previous>) up -d cmdb`.
- [ ] ISC-34: `deploy.sh` keeps a one-line log at `/opt/cmdb/deploy.log` per invocation: `<ts> <tag> <result>`.
- [ ] ISC-35: The workflow's deploy step `ssh ubuntu@cmdb.edch.eu 'sudo -n /opt/cmdb/deploy.sh <sha>'` (with `sudo -n` failing closed if NOPASSWD isn't configured) — and the same step works with no `sudo` since `ubuntu` is in the `docker` group.
- [ ] ISC-36: Workflow's SSH step uses `webfactory/ssh-agent@v0.9.0` with `${{ secrets.DEPLOY_SSH_KEY }}`; the public key half is `ubuntu@cmdb.edch.eu:~/.ssh/authorized_keys` (configured out-of-band).
- [ ] ISC-37: Workflow's known_hosts is pinned to `cmdb.edch.eu`'s real host key via `ssh-keyscan` → `${{ secrets.DEPLOY_KNOWN_HOSTS }}`; bare `StrictHostKeyChecking=no` is forbidden.

### Secrets + configuration

- [ ] ISC-38: `infra/vm/.env.example` enumerates: `CMDB_TAG`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`, `SESSION_SECRET`, `AUTH_MODE` (default `dev` for Day 1), plus commented-out OIDC quartet for Phase 2.
- [ ] ISC-39: `/opt/cmdb/.env` (on VM) is `chmod 600`, owned `root:root`, and never appears in `git status` (it's under `/opt`, not the repo).
- [ ] ISC-40: `gitleaks` (existing CI `secrets` job) does NOT find any new secret in the deploy PR.

### HANDOVER documentation

- [ ] ISC-41: `docs/HANDOVER.md` "Deployment" section is no longer "TBD" — covers VM hostname, first-deploy procedure, day-N deploy procedure (push to main → automatic), rollback recipe with exact command.
- [ ] ISC-42: `docs/HANDOVER.md` "Secrets" section names every secret, where its canonical copy lives (`/opt/cmdb/.env`, operator vault), and the rotation procedure.
- [ ] ISC-43: `docs/HANDOVER.md` "Runbook" section covers: deploy a new version, rollback, seed real EDCH inventory (one-shot), `pg_dump` backup, `pg_restore`, shell into the app container, tail logs.
- [ ] ISC-44: `docs/HANDOVER.md` Known Gotchas section seeded with the gotchas discovered during this iteration (at minimum: the dev-mode banner is intentional; GHCR pull requires the read-only PAT; first deploy fails until the operator copies seed.local.ts if seeding is requested).

### Anti-criteria (≥1 required; this iteration ships ten)

- [ ] ISC-45: Anti: prod `/opt/cmdb/.env` is NEVER committed to the repo. (Probe: `git ls-files /opt/cmdb` returns empty.)
- [ ] ISC-46: Anti: the real `db/seed.local.ts` is NEVER pushed to the repo. (Probe: `git log --all --full-history -- db/seed.local.ts` returns empty.)
- [ ] ISC-47: Anti: no `${{ secrets.* }}` reference in `deploy.yml` carries a production credential value — only the SSH key, known_hosts, and deploy host string. (Probe: `grep -E 'secrets\.' .github/workflows/deploy.yml` matches only the allowlist.)
- [ ] ISC-48: Anti: the dev-mode banner ("DEV AUTH — NO PRODUCTION USE") IS visible on `https://cmdb.edch.eu/` Day 1 — confirms the deploy did not accidentally ship in `oidc` mode against an unconfigured IdP. (Probe: `curl -s https://cmdb.edch.eu/ | grep -i 'DEV AUTH'`.)
- [ ] ISC-49: Anti: Postgres is NOT bound to a host port. (Probe: `ss -tlnp | grep :5432` on the VM returns empty.)
- [ ] ISC-50: Anti: `deploy.sh` does NOT proceed to `up -d cmdb` if `migrate` exits non-zero. (Probe: synthetic broken migration causes `deploy.sh` to exit 1 before the swap.)
- [ ] ISC-51: Anti: a failed deploy does NOT leave the previous container running with corrupted state — the previous `:<prev-sha>` image remains pullable from GHCR, and the rollback recipe is exercised end-to-end as a smoke test once before sign-off.
- [ ] ISC-52: Anti: SSH from GitHub Actions does NOT use `StrictHostKeyChecking=no`. Host key pinning via `secrets.DEPLOY_KNOWN_HOSTS` is the contract.

## Test Strategy

| isc | type | check | threshold | tool |
| --- | --- | --- | --- | --- |
| ISC-1..4 | code-grader | route returns expected shape | 200/503 + JSON body | `curl` against local SSR server in test |
| ISC-5..6 | code-grader | bun test pass | all assertions pass | `bun test tests/routes/health.test.ts` |
| ISC-7..12 | code-grader | workflow file exists + valid + image pushed | `actionlint` clean + `docker pull` succeeds post-merge | `actionlint`, `gh run view`, `docker pull` |
| ISC-13..18 | code-grader + manual | bootstrap.sh syntax + idempotence | shellcheck clean, dry-run succeeds on partially-bootstrapped host | `shellcheck`, manual re-run on VM |
| ISC-19..26 | code-grader | compose file valid + brings up | `docker compose config` clean, `docker compose up -d` healthy | `docker compose config`, healthcheck poll |
| ISC-27..31 | live-probe | HTTPS responses post-deploy | 200 + LE issuer + HSTS header + 308 on plain HTTP | `curl -I`, `openssl s_client` |
| ISC-32..37 | code-grader + live-probe | deploy.sh contract + workflow runs | `bash -n deploy.sh`, `shellcheck`, end-to-end deploy run succeeds | shellcheck, `gh run view`, post-deploy curl |
| ISC-38..40 | code-grader | env example complete, perms right, no leaks | `stat`, `git ls-files`, gitleaks | `stat`, `git`, gitleaks (CI) |
| ISC-41..44 | inspection | HANDOVER sections populated, no TBD | grep `TBD` returns nothing in updated sections | `grep -c TBD docs/HANDOVER.md` |
| ISC-45..52 | live-probe + code-grader | anti-criteria probes | each probe matches expected empty/non-empty | per-ISC probe (see criterion text) |

## Features

| name | description | satisfies | depends_on | parallelizable |
| --- | --- | --- | --- | --- |
| `health-route` | New `/health` SSR route + DB probe + integration tests | ISC-1..6 | — | yes |
| `gh-workflow-deploy` | New `.github/workflows/deploy.yml`: build + push + remote deploy | ISC-7..12, ISC-35..37 | `health-route` (for post-deploy probe) | partial |
| `vm-bootstrap` | `infra/vm/bootstrap.sh` + Compose + Caddyfile + deploy.sh + .env.example | ISC-13..40 | — | yes |
| `caddy-tls` | Caddyfile + first-deploy LE cert acquisition | ISC-27..31 | `vm-bootstrap`, `gh-workflow-deploy` | no |
| `handover-fillin` | Replace TBD sections in `docs/HANDOVER.md` | ISC-41..44 | all others (writes what was built) | no |
| `anti-criteria-smoketest` | One-time end-to-end exercise of rollback + broken-migration paths | ISC-45..52 | all infra services running | no |

## Decisions

Timestamped decision log. `refined:` prefix marks tightening of an earlier decision.

- **D-1** (2026-05-18) — **Phase 1 ships `AUTH_MODE=dev`; OIDC switch deferred to Phase 2.** Why: principal directive, unblocks the service going live before OPERAS ID client registration completes. The red dev-mode banner per ADR-0003 is the safeguard.
- **D-2** (2026-05-18) — **GHCR over self-hosted registry.** Why: zero infra cost, built-in `GITHUB_TOKEN` auth on push, no extra service to monitor or back up. Public-readable namespace `eudch/cmdb` matches the public repo. Tradeoff: VM needs a read-only PAT for pull (one secret to manage), accepted.
- **D-3** (2026-05-18) — **Caddy over Nginx / Traefik.** Why: zero-config Let's Encrypt + HTTP/3 + minimal Caddyfile. Nginx wins on configurability for complex routing, irrelevant at this scope. Traefik wins on dynamic Docker discovery, also irrelevant for a four-service compose stack.
- **D-4** (2026-05-18) — **Postgres in the same compose stack as the app, named volume, not bind-mount.** Why: self-contained-on-one-VM constraint; Day 1 doesn't justify a managed Postgres. Named volume keeps the data path Docker-managed (cleaner backup story, no UID-mapping surprises). Backup is a separate ISA iteration.
- **D-5** (2026-05-18) — **Workflow does NOT run docker against a remote daemon; it SSH-invokes `/opt/cmdb/deploy.sh`.** Why: docker socket exposure over the network is a major attack surface; SSH with a deploy key is the standard and gives us version-controlled deploy logic on-VM rather than in workflow YAML.
- **D-6** (2026-05-18) — **`migrate` service exits cleanly before `cmdb` starts; gated by `service_completed_successfully`.** Why: a half-applied migration plus a live app is the worst state to recover from. Compose v2's exit-state condition is the right contract.
- **D-7** (2026-05-18) — **Seed via profile-gated one-shot service, real `seed.local.ts` copied via `scp` (out-of-band), bind-mounted into the seed container.** Why: AGENTS.md anti-pattern forbids pushing real inventory to git; we use the existing `bun run db:seed:local` machinery without committing the inventory. The profile keeps the seed service out of `up -d`.
- **D-8** (2026-05-18) — **Deploy as `ubuntu` user.** Why: principal directive. The textbook hardening (dedicated `deploy` user with narrow sudoers) is deferred until the threat model warrants it; the deploy.sh contract is identical either way, so the migration is one-time and low-risk.
- **D-9** (2026-05-18) — **Day 1 trigger: push to `main`. Phase 1.5 trigger: `release: { types: [published] }`.** Why: principal directive — push-on-main accelerates feedback while the surface is small; tag-only protects the live service once feature velocity slows and stability matters more than freshness. The cutover is a single `on:` block edit; `workflow_dispatch` survives both phases for manual rollbacks.

## Changelog

> Deutsch-style conjecture / refutation / learning entries appended via `Skill("ISA", "append changelog ...")` as the project's understanding tightens. Empty at scaffold time.

## Verification

> Per-ISC evidence appended as criteria pass. Empty at scaffold time.
