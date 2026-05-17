# ADR-0001 — Technology Stack

**Status:** Proposed (not yet decided)

**Date:** 2026-05-17

## Context

The CMDB needs a frontend, a backend, a database, and a deployment story. The constraints are:

- Solo development by one OPERAS sysadmin with limited weekly hours.
- TypeScript everywhere preferred (existing fluency, ecosystem alignment with other OPERAS / EDCH tooling).
- Self-hosted on Example PaaS (Example-Host-1 / Example-Host-2 / similar) — no vendor / SaaS dependency.
- Must be handover-ready: another sysadmin should be able to take over with `docs/HANDOVER.md` alone.
- Schema must enforce a `namespace` column from migration 1 (ADR-0002).
- No vendor cost — MIT / open-source dependencies only.

## Options under consideration

This ADR is a placeholder. Final decision lands once a focused stack review is done. Candidates to weigh:

- **Frontend:** Astro + minimal interactivity (HTMX or vanilla) — vs — SvelteKit — vs — Next.js / React.
- **Backend:** Same framework as frontend (Astro / SvelteKit / Next server routes) — vs — separate Hono / Elysia / Express API behind a static frontend.
- **Database:** PostgreSQL (default for relational + JSON columns + strong constraint support — preferred for the namespace constraint requirement) — vs — SQLite (simpler ops, viable at this scale).
- **Migration tooling:** Drizzle ORM migrations — vs — Prisma — vs — DB-native (Sqitch).
- **Runtime:** Bun — vs — Node.

## Decision

(Pending.)

## Consequences

(To be filled once the decision is made.)

## Notes

The ISA (private, at `MEMORY/WORK/operas-cmdb/ISA.md`) carries the full background. Repo ADRs are the public-facing curated subset — they record the decision and the reasoning, not the deliberation.
