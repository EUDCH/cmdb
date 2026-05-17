# ADR-0001 — Technology Stack

**Status:** Accepted

**Date:** 2026-05-17

## Context

The CMDB needs a frontend, a backend, a database, and a deployment story. The constraints driving the choice:

- Solo development by one OPERAS sysadmin with limited weekly hours.
- TypeScript everywhere preferred (existing fluency, ecosystem alignment with other OPERAS / EDCH tooling).
- Self-hosted on PCSS — no vendor / SaaS dependency.
- Must be handover-ready: another sysadmin should be able to take over with `docs/HANDOVER.md` alone. A future reader should see HTML templates + route handlers, not a reactive component graph.
- Schema must enforce a `namespace` column at the DB layer from migration 1 (ADR-0002).
- All dependencies must be MIT / BSD / Apache — no copyleft surprises, no vendor cost.

## Decision

| Layer | Choice |
| --- | --- |
| Runtime | **Bun** |
| Framework | **Astro** in SSR mode + **HTMX** for interactive bits (form posts, partial updates, filter panels) |
| Database | **PostgreSQL** |
| ORM / migrations | **Drizzle ORM** — TypeScript schema, plain SQL migration files committed to the repo |
| Auth | OIDC against **OPERAS ID** via `openid-client`; server-side cookie sessions |
| Deployment | PCSS host, `systemd` unit running Bun, Caddy or Traefik in front for TLS, Postgres co-located or PCSS-managed |

## Rationale

### Astro + HTMX (over SvelteKit / Next.js / hono-API + static frontend)

The CMDB is a CRUD-screen-by-CRUD-screen internal tool. The Astro MPA-with-islands model fits that shape exactly: each page is an SSR template, HTMX handles the partial-update interactions (filter panels, inline edits, dependency-graph lookups) without bringing a full reactive component framework.

The load-bearing reason is handover. A sysadmin opening the codebase in 2027 should see HTML templates plus server route handlers — a stack they can reason about without learning a reactivity model. SvelteKit is the runner-up; we'd swap to it if the UX requires more client-side richness than HTMX can deliver. Next.js / RSC carries complexity tax with no payoff at this scope.

### PostgreSQL (over SQLite)

The namespace `CHECK` constraint is implementable on both, but Postgres wins on:

- JSONB columns for flexible asset metadata that doesn't justify its own table.
- Concurrent admin writes (multi-editor scenario in v2).
- PCSS likely already runs PG for other OPERAS services — operationally aligned.

SQLite would be acceptable for v1 in isolation but doesn't carry into v2 as cleanly.

### Drizzle ORM (over Prisma / Sqitch / hand-rolled)

Drizzle's migrations are inspectable SQL files committed to the repo. ADR-0002's namespace constraint will land as a literal `ALTER TABLE … ADD CONSTRAINT … CHECK (namespace IN ('edch'))` in `migrations/0001_init.sql`, not buried inside an ORM-generated artifact. The schema is TypeScript with strong inferred types, but the database side stays standard SQL — a DBA can read it, a future maintainer can diff it.

Prisma's codegen step hurts handover. Sqitch (pure SQL) would force a hand-rolled query layer in TypeScript, expensive for a solo dev.

### Bun (over Node)

PAI / OPERAS / EDCH tooling convention is Bun. Astro, HTMX, Drizzle, and `openid-client` all run on Bun.

### OIDC against OPERAS ID

OPERAS ID is the natural identity source (G2 also covers its upgrade). Server-side cookie sessions keep the JS footprint small.

## Consequences

**Positive:**

- Small JS surface = clearer handover.
- All TypeScript, all Bun, all MIT/BSD/Apache.
- Inspectable SQL migrations match the namespace-constraint-at-DB-layer principle.
- Stack composable with existing OPERAS infrastructure (PCSS, OPERAS ID).

**Negative:**

- HTMX + Astro is less common than React/Next; the talent pool is narrower if the project ever scales beyond a single maintainer. Mitigated by the doc-first handover model and the fact that HTMX is small enough to learn in an afternoon.
- Bun is younger than Node; rough edges remain (Astro Bun adapter is stable but not Node's level of battle-testing). Mitigated by sticking to mainstream Astro features.

**Neutral:**

- Locks the project into the Postgres feature set. Fine — the namespace constraint already requires Postgres-grade SQL.

## Notes

- The PCSS hostname, the systemd unit name, the TLS reverse proxy choice (Caddy vs Traefik), and the Postgres deployment shape (co-located vs PCSS-managed) all land in `docs/HANDOVER.md` once decided. None of those affect the stack itself.
- ADR-0002 (namespace) is unchanged by this decision; the implementation now has a concrete migration path via Drizzle's SQL-first migrations.
