# ADR-0002 — Namespace / Tenant Column Enforced from Migration 1

**Status:** Accepted

**Date:** 2026-05-17

## Context

The CMDB ships v1 as EDCH-only inventory, but v2 must extend to the broader OPERAS infrastructure as a sibling namespace — not a fork, not a migration, not a parallel deployment. If multi-tenancy is bolted on later we will spend the v2 cycle paying schema-debt instead of delivering value.

The cheapest moment to enforce a `namespace` (or `tenant`) column is **migration 1**, when every table is empty.

## Decision

Every asset-level table — `service`, `host`, `owner`, `dependency`, `audit`, and any future asset entity — carries a non-nullable `namespace` column. The constraint lives at the database layer (`NOT NULL` + index + check on the allowed namespace values), not in the application code alone. Application code MUST set the column on every insert; the DB will reject any insert that doesn't.

On day one the only legal value is `edch`. When OPERAS v2 lands, `operas` (and any further namespaces) are added to the allowed-values check via an additive migration — no schema rewrite required.

Cross-namespace queries are explicit at the query layer (`WHERE namespace IN ('edch','operas')` or an absence of namespace filter for admin-grade reports), never implicit. The default surface filters by current namespace; cross-namespace views are opt-in.

## Consequences

**Positive:**

- v1 → v2 transition is a data scale-up (insert OPERAS rows with `namespace='operas'`), not a migration.
- The constraint catches "forgot to scope" bugs at the DB layer, where they cannot be silenced by an over-broad ORM default.
- Audit trails are namespace-tagged from the first row — useful for compliance and ownership reviews.

**Negative:**

- Every insert and every query must pass through a namespace context. Forgetting is harder, but the test surface is larger.
- A future "consolidated view across namespaces" feature has to be a deliberate addition, not a default — which is the point, but it does mean a small extra design step.

**Neutral:**

- Indexes on `(namespace, <other>)` need conscious composite-index design. Standard practice; flagged here so it doesn't surprise the next maintainer.

## Notes

- The constraint is enforced **at the DB layer** specifically — application-level enforcement (e.g., an ORM hook) is not sufficient. A stray manual SQL session must also be rejected.
- The naming "namespace" vs "tenant" is deliberate: this is a logical scope, not a security boundary. Auth-level multi-tenancy (separate access controls per namespace) is a v2 question, tracked separately.
- Integration test ISC-2 in the ISA verifies this: a seeded insert with `namespace=NULL` must fail at the DB layer, not just at the app layer.
