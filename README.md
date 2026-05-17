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

Requirements: Bun, Docker (Compose v2).

```fish
# 1. Install deps + seed env
bun install
cp .env.example .env

# 2. Bring up Postgres — migration 0001 auto-applies on first boot.
docker compose up -d

# 3. Run the dev server natively against the containerised DB.
bun run dev
```

Visit `http://127.0.0.1:4321` — the Services and Hosts pages render empty tables until rows are inserted. The HTMX CDN tag is wired in the base layout for the interactive bits that arrive in subsequent iterations.

### Full-stack containerised test

```fish
docker compose --profile app up -d --build
```

Builds the multi-stage Bun + Astro image and starts the app at `http://127.0.0.1:4321` against the containerised Postgres. Useful for verifying production wiring; the dev-server hot-reload path stays via `bun run dev`.

### Reset the DB

```fish
docker compose down -v      # drops the named volume cmdb-pgdata
docker compose up -d        # migration replays on the fresh volume
```

### Schema inspection

`bun run db:studio` opens Drizzle Studio against `DATABASE_URL`. `psql "$DATABASE_URL"` works for raw SQL inspection.

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
