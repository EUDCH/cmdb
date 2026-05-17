import { pgEnum, pgTable, text, timestamp, uuid, jsonb, primaryKey } from "drizzle-orm/pg-core";

// Tenant / namespace enum — EDCH-first. New namespaces are added via
// `ALTER TYPE namespace_kind ADD VALUE 'operas'` in an additive migration
// (ADR-0002). Every asset-level table references this enum as a NOT NULL column.
export const namespaceKind = pgEnum("namespace_kind", ["edch"]);

// Lifecycle state — first-class enum so transitions are validated at the DB layer.
export const lifecycleState = pgEnum("lifecycle_state", [
  "planned",
  "staging",
  "production",
  "deprecated",
  "retired",
]);

// Typed dependency edge kinds. The naming follows `<from>-<verb>-<to>` and is
// extended additively as new edge types are needed.
export const dependencyKind = pgEnum("dependency_kind", [
  "service-uses-db",
  "service-uses-aai",
  "service-depends-on-service",
  "service-runs-on-host",
]);

// Host kind — VM, container, physical machine, or external (partner-managed).
export const hostKind = pgEnum("host_kind", [
  "vm",
  "container",
  "physical",
  "external",
]);

export const owner = pgTable("owner", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: namespaceKind("namespace").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const service = pgTable("service", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: namespaceKind("namespace").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  lifecycleState: lifecycleState("lifecycle_state").notNull().default("planned"),
  ownerId: uuid("owner_id").references(() => owner.id),
  imsLink: text("ims_link"),
  monitorLink: text("monitor_link"),
  repoUrl: text("repo_url"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const host = pgTable("host", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: namespaceKind("namespace").notNull(),
  hostname: text("hostname").notNull(),
  kind: hostKind("kind").notNull(),
  location: text("location"),
  notes: text("notes"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dependency = pgTable(
  "dependency",
  {
    fromId: uuid("from_id").notNull(),
    toId: uuid("to_id").notNull(),
    kind: dependencyKind("kind").notNull(),
    namespace: namespaceKind("namespace").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId, t.kind] })],
);

export const audit = pgTable("audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  namespace: namespaceKind("namespace").notNull(),
  actor: text("actor").notNull(),
  entityKind: text("entity_kind").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  diff: jsonb("diff"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
