# OPERAS CMDB

Configuration Management Database for [OPERAS](https://www.operas-eu.org) and the [European Diamond Capacity Hub (EDCH)](https://www.eudch.eu).

**v1 — EDCH-first.** Every service operated under the EDCH technical coordination role gets its inventory (hosts, owner, dependencies, lifecycle state, escalation contacts) captured in a queryable web application.

**v2 — OPERAS-wide.** Same data model, broader tenant. EDCH is the first namespace; OPERAS becomes a sibling once the v1 MVP is proven.

Currently in design phase — no code yet. See `docs/` for architecture and decision records.

## Status

| Item | State |
| --- | --- |
| Stack | Bun · Astro (SSR) + HTMX · PostgreSQL · Drizzle ORM · OIDC (OPERAS ID) — see [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md) |
| Schema namespace constraint | Decided — see [`docs/adr/0002-namespace.md`](docs/adr/0002-namespace.md) |
| Deployment target | Example PaaS (likely) |
| Repo location | EUDCH org for now, may move to OPERAS org for v2 |

## Quickstart

Requirements: Bun, PostgreSQL.

```fish
# 1. Install deps
bun install

# 2. Bring up a local Postgres (any method works — direct install, docker, etc.)
#    Then copy .env.example to .env and fill in DATABASE_URL.
cp .env.example .env
$EDITOR .env

# 3. Apply the initial migration (raw SQL — namespace ENUM, tables, indexes, triggers).
psql "$DATABASE_URL" -f migrations/0001_init.sql

# 4. Run the dev server.
bun run dev
```

Visit `http://127.0.0.1:4321` — the Services and Hosts pages render empty tables until rows are inserted. The HTMX CDN tag is wired in the base layout for the interactive bits that arrive in subsequent iterations.

Drizzle Studio (`bun run db:studio`) opens a browser-based DB inspector against the same `DATABASE_URL` once `bun install` has fetched `drizzle-kit`.

## Documents

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — high-level architecture, data model overview, integration points
- [`docs/HANDOVER.md`](docs/HANDOVER.md) — operational handover (deployment, secrets, runbook, contact); kept current as the system evolves
- [`docs/adr/`](docs/adr/) — Architecture Decision Records, one file per significant decision

## Scope

In scope for v1:

- EDCH-operated services, one row per service
- Hosts / VMs / containers running each service
- Service owners + escalation contacts
- Inter-service dependencies (typed edges)
- Lifecycle state (planned / staging / prod / retired)
- Namespace / tenant field on every asset-level table

Out of scope (other projects own these):

- Live monitoring / alerting — referenced via link, not run by CMDB
- Backup orchestration
- Identity / authentication system internals
- Source-code inventory beyond a repo URL field
- Auto-discovery / agent-based inventory in v1

## Licence

MIT — see [`LICENSE`](LICENSE).

## Contributing

Solo development for now (single OPERAS sysadmin). Issues and discussion welcome; PRs accepted once v1 MVP is in place.
