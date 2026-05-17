# OPERAS CMDB

Configuration Management Database for [OPERAS](https://www.operas-eu.org) and the [European Diamond Capacity Hub (EDCH)](https://www.eudch.eu).

**v1 — EDCH-first.** Every service operated under the EDCH technical coordination role gets its inventory (hosts, owner, dependencies, lifecycle state, escalation contacts) captured in a queryable web application.

**v2 — OPERAS-wide.** Same data model, broader tenant. EDCH is the first namespace; OPERAS becomes a sibling once the v1 MVP is proven.

Currently in design phase — no code yet. See `docs/` for architecture and decision records.

## Status

| Item | State |
| --- | --- |
| Stack | TBD — see [`docs/adr/0001-stack.md`](docs/adr/0001-stack.md) |
| Schema namespace constraint | Decided — see [`docs/adr/0002-namespace.md`](docs/adr/0002-namespace.md) |
| Deployment target | Example PaaS (likely) |
| Repo location | EUDCH org for now, may move to OPERAS org for v2 |

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
