-- Migration 0001 — initial schema for OPERAS CMDB v1 (EDCH-first).
--
-- This file is the source of truth for the database schema. The Drizzle TS
-- schema in db/schema.ts mirrors it; if the two ever drift, this file wins
-- and db/schema.ts must be corrected.
--
-- ADR-0002 (namespace enforced at DB layer from migration 1) is implemented
-- here as a Postgres ENUM type. v2 will add additional namespaces via
-- `ALTER TYPE namespace_kind ADD VALUE 'operas'` — additive, no schema rewrite.
--
-- Transaction boundary: the production migration runner
-- (db/migrate.ts) wraps each file in `sql.begin(...)`, so any failed
-- DDL statement here rolls back atomically. Do NOT add
-- `BEGIN; … COMMIT;` at the top level of this file — that would nest a
-- transaction inside the runner's and corrupt its rollback semantics.
-- The test harness (tests/setup-db.ts) applies migrations via
-- `sql.unsafe(...)` in autocommit mode (no surrounding transaction);
-- the schema DDL is idempotent enough that autocommit application is
-- fine there.

-- =============================================================================
-- Enums
-- =============================================================================

CREATE TYPE namespace_kind AS ENUM ('edch');

CREATE TYPE lifecycle_state AS ENUM (
  'planned',
  'staging',
  'production',
  'deprecated',
  'retired'
);

CREATE TYPE dependency_kind AS ENUM (
  'service-uses-db',
  'service-uses-aai',
  'service-depends-on-service',
  'service-runs-on-host'
);

CREATE TYPE host_kind AS ENUM (
  'vm',
  'container',
  'physical',
  'external'
);

-- =============================================================================
-- Tables
-- =============================================================================

CREATE TABLE owner (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace   namespace_kind NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE service (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace         namespace_kind NOT NULL,
  name              TEXT NOT NULL,
  description       TEXT,
  lifecycle_state   lifecycle_state NOT NULL DEFAULT 'planned',
  owner_id          UUID REFERENCES owner(id) ON DELETE SET NULL,
  ims_link          TEXT,
  monitor_link      TEXT,
  repo_url          TEXT,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_namespace_name_unique UNIQUE (namespace, name)
);

CREATE TABLE host (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace   namespace_kind NOT NULL,
  hostname    TEXT NOT NULL,
  kind        host_kind NOT NULL,
  location    TEXT,
  notes       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT host_namespace_hostname_unique UNIQUE (namespace, hostname)
);

CREATE TABLE dependency (
  from_id     UUID NOT NULL,
  to_id       UUID NOT NULL,
  kind        dependency_kind NOT NULL,
  namespace   namespace_kind NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (from_id, to_id, kind),
  CONSTRAINT dependency_no_self_loop CHECK (from_id <> to_id)
);

CREATE TABLE audit (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  namespace    namespace_kind NOT NULL,
  actor        TEXT NOT NULL,
  entity_kind  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,
  reason       TEXT,
  diff         JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Indexes — composite on (namespace, …) per ADR-0002.
-- =============================================================================

CREATE INDEX owner_namespace_idx     ON owner    (namespace);
CREATE INDEX service_namespace_idx   ON service  (namespace);
CREATE INDEX service_owner_idx       ON service  (owner_id);
CREATE INDEX service_lifecycle_idx   ON service  (namespace, lifecycle_state);
CREATE INDEX host_namespace_idx      ON host     (namespace);
CREATE INDEX host_kind_idx           ON host     (namespace, kind);
CREATE INDEX dependency_from_idx     ON dependency (from_id);
CREATE INDEX dependency_to_idx       ON dependency (to_id);
CREATE INDEX dependency_namespace_idx ON dependency (namespace);
CREATE INDEX audit_namespace_idx     ON audit    (namespace, created_at DESC);
CREATE INDEX audit_entity_idx        ON audit    (entity_kind, entity_id);

-- =============================================================================
-- updated_at triggers — keep updated_at in sync without app-side bookkeeping.
-- =============================================================================

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER owner_touch_updated_at
  BEFORE UPDATE ON owner
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER service_touch_updated_at
  BEFORE UPDATE ON service
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER host_touch_updated_at
  BEFORE UPDATE ON host
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
