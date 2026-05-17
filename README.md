# EDCH CMDB

Configuration Management Database for the [European Diamond Capacity Hub (EDCH)](https://www.eudch.eu) — services under EDCH technical coordination get their inventory (hosts, owner, dependencies, lifecycle state, escalation contacts) captured in a queryable web application.

EDCH is hosted by [OPERAS](https://www.operas-eu.org); shared infrastructure (OPERAS ID for auth, OPERAS IMS for service docs) is integrated as upstream, but the CMDB itself is scoped to EDCH operations. A second `operas` namespace is planned for v2 (ADR-0002) to widen coverage without a schema migration.

## Status

| Item | State |
| --- | --- |
| Stack | Bun · Astro (SSR) + HTMX · PostgreSQL · Drizzle ORM · OIDC (OPERAS ID) — see [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md) |
| Schema namespace constraint | `edch` only in v1; `operas` added additively in v2 — see [`docs/adr/0002-namespace.md`](docs/adr/0002-namespace.md) |
| Auth | OIDC against OPERAS ID + `AUTH_MODE=dev` escape hatch — see [`docs/adr/0003-auth.md`](docs/adr/0003-auth.md) |
| Deployment target | PCSS (likely) |
| Repo location | [EUDCH](https://github.com/EUDCH) GitHub org |

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

### Auth

The app is gated by middleware. Two modes (see [`docs/adr/0003-auth.md`](docs/adr/0003-auth.md)):

- **`AUTH_MODE=dev`** — middleware short-circuits with a hardcoded dev user and a red `DEV AUTH — NO PRODUCTION USE` banner. Use this for stack-up testing before OPERAS ID has the client registered. `.env.example` ships with this default so the Quickstart works out of the box.
- **`AUTH_MODE=oidc`** — full OIDC + PKCE against OPERAS ID. Requires:

  ```shell
  OIDC_ISSUER_URL=https://id.operas-eu.org
  OIDC_CLIENT_ID=...
  OIDC_CLIENT_SECRET=...
  OIDC_REDIRECT_URI=https://cmdb.example.org/auth/callback
  SESSION_SECRET=$(openssl rand -base64 48)
  ```

  `OIDC_REDIRECT_URI` must match the app-facing URL exactly. `SESSION_SECRET` must be at least 32 bytes.

Routes: `/auth/login`, `/auth/callback`, `/auth/logout`. Sessions live in an HMAC-signed `HttpOnly` cookie with a 12 h TTL.

## Branding

Visual identity follows Athina's canonical *Brand Sheet EDCH.pdf*:

- **Palette** — primary `#355BA9`, plus eight component accents (`#8475B6`, `#F05D89`, `#FCB316`, `#87C540`, `#00A666`, `#EF4136`, `#F47721`, `#16C1F3`). Exposed as CSS custom properties on `:root` in `src/layouts/Base.astro`.
- **Typography** — Barlow (400 / 500 / 600 / 700), loaded from Google Fonts.
- **Lifecycle pills** — each `lifecycle_state` maps to a brand accent (`planned`=violet, `staging`=amber, `production`=teal, `deprecated`=orange, `retired`=muted).

### Known limitation — placeholder logo

`public/edch-wordmark.svg` is a **placeholder**: a typographic "EDCH" wordmark rendered in Barlow Bold at the primary blue. The EDCH brand-asset folder on Drive holds only the Brand Sheet PDF + three brochure variants — no master logo SVG or high-resolution PNG.

To replace with the canonical master logo:

1. Get the source SVG (or Illustrator file) from Athina (`athina.papadopoulou@operas-eu.org`, EDCH communications officer).
2. Drop it at `public/edch-logo.svg` (or `public/edch-logo.png`).
3. Swap the `<img src="/edch-wordmark.svg">` reference in `src/layouts/Base.astro` to point at the new asset.

Until then the wordmark is brand-faithful in colour + typeface and ships immediately rather than blocking on Athina.

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
