# Architecture

> Draft — to be filled out as design decisions land. Each major decision gets its own ADR under `docs/adr/`; this document keeps the integrated picture current.

## Overview

The EDCH CMDB is a queryable web application backed by a relational database. It stores asset-level entities (services, hosts, owners, dependencies) for services operated under the European Diamond Capacity Hub technical coordination role. Every table carries a mandatory `namespace` field so that — when OPERAS-wide coverage becomes the next ask — adding an `operas` sibling namespace is an additive migration, not a rewrite (ADR-0002).

The CMDB is the **system of record** for EDCH asset data — it is where data is edited, not a mirror of upstream sources. Adjacent systems (OPERAS IMS in Confluence + Jira, monitoring stacks, source repos) link **into** the CMDB; the CMDB links **out** to them via canonical pointers.

## Data Model (sketch)

The shapes below are placeholders; the final schema lands with the first migration.

- **`service`** — one row per logical service. Fields: `id`, `namespace`, `name`, `description`, `lifecycle_state`, `owner_id`, `created_at`, `updated_at`.
- **`host`** — one row per VM / container / physical machine. Fields: `id`, `namespace`, `hostname`, `kind` (vm / container / physical), `location`, `notes`.
- **`service_host`** — many-to-many link table between services and hosts.
- **`owner`** / **`contact`** — person or role responsible for a service; wikilinks back to the Obsidian people profiles where applicable.
- **`dependency`** — directional, typed edge between two assets. Types: `service-uses-db`, `service-uses-aai`, `service-depends-on-service`, `service-runs-on-host`, etc.
- **`audit`** — append-only log of edits: who, when, what changed, free-text reason.

The `namespace` field is enforced as a non-nullable column on every asset table; cross-namespace queries are explicit, not implicit.

## Lifecycle States

`planned` → `staging` → `production` → `deprecated` → `retired`. State transitions are first-class events (logged in `audit`); a retired service stays in the CMDB indefinitely for historical traceability.

## Integration Points

- **OPERAS IMS (Confluence + Jira)** — each service entry carries a canonical IMS link; IMS pages link back.
- **Monitoring** — HetrixTools (OPERAS A/R), Pulsetic (EDCH A/R), Zabbix, future LGTM. Pointer-only in v1; deeper sync is v2 work.
- **Source repos** — each service entry carries a repo URL field (GitHub OPERAS-org / forge.bapt.name / vendor as appropriate).
- **EDCH services overview spreadsheet** — kept in parallel during the transition; spreadsheet rows annotated with CMDB row pointers.

## Out-of-Process Dependencies

To be confirmed once the stack is chosen (see ADR-0001). Likely a relational DB (PostgreSQL leading candidate), reverse-proxy + TLS termination, and the authentication path (OPERAS ID via OIDC is the most natural fit).

## Open Questions

- Auth model — OIDC against OPERAS ID directly, or a thin layer in front?
- Read-only public view, or fully authenticated for all surfaces?
- Schema migration tooling — application-level (e.g., Drizzle, Prisma, Knex) or DB-native (Sqitch)?
- Asset import path — initial bulk seed from the EDCH spreadsheet, or row-by-row manual entry?
