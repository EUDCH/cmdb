/**
 * Seed for EDCH services, hosts and dependencies — v0 source of truth.
 *
 * Run with: `bun run db:seed`
 *
 * Upsert semantics: each row is keyed on its natural unique tuple
 * (owners + services on `(namespace, name)`, hosts on `(namespace, hostname)`,
 * dependencies on `(from_id, to_id, kind)`); existing rows are updated to
 * match this file. The seed is canonical *only* until the edit UI lands and
 * an audit trail starts capturing manual mutations — at that point this
 * script should become insert-if-missing and never overwrite.
 *
 * Brand component mapping lives in service.metadata.component and follows
 * Athina's brand sheet (Forum & Registry, Diamond Discovery Hub, Resources
 * & Guidelines, Training Platform, Publishing Tools, Diamond OA Standard).
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set — run via `bun run db:seed` from project root");
}

const client = postgres(url, { max: 4 });
const db = drizzle(client, { schema });

type LifecycleState = "planned" | "staging" | "production" | "deprecated" | "retired";
type HostKind = "vm" | "container" | "physical" | "external";

async function upsertOwner(name: string, email: string | null) {
  const [existing] = await db
    .select()
    .from(schema.owner)
    .where(and(eq(schema.owner.namespace, "edch"), eq(schema.owner.name, name)));
  if (existing) {
    if (existing.email === (email ?? null)) return existing;
    const [updated] = await db
      .update(schema.owner)
      .set({ email: email ?? null, updatedAt: new Date() })
      .where(eq(schema.owner.id, existing.id))
      .returning();
    console.log(`~ owner: ${name}`);
    return updated;
  }
  const [row] = await db
    .insert(schema.owner)
    .values({ namespace: "edch", name, email: email ?? undefined })
    .returning();
  console.log(`+ owner: ${name}`);
  return row;
}

type ServiceSeed = {
  name: string;
  description: string;
  lifecycleState: LifecycleState;
  ownerId: string;
  imsLink?: string | null;
  monitorLink?: string | null;
  repoUrl?: string | null;
  metadata?: Record<string, unknown>;
};

async function upsertService(svc: ServiceSeed) {
  const [existing] = await db
    .select()
    .from(schema.service)
    .where(and(eq(schema.service.namespace, "edch"), eq(schema.service.name, svc.name)));
  if (existing) {
    const [updated] = await db
      .update(schema.service)
      .set({
        description: svc.description,
        lifecycleState: svc.lifecycleState,
        ownerId: svc.ownerId,
        imsLink: svc.imsLink ?? null,
        monitorLink: svc.monitorLink ?? null,
        repoUrl: svc.repoUrl ?? null,
        metadata: svc.metadata ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.service.id, existing.id))
      .returning();
    console.log(`~ service: ${svc.name}`);
    return updated;
  }
  const [row] = await db
    .insert(schema.service)
    .values({ ...svc, namespace: "edch" })
    .returning();
  console.log(`+ service: ${svc.name}`);
  return row;
}

type HostSeed = {
  hostname: string;
  kind: HostKind;
  location?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
};

async function upsertHost(h: HostSeed) {
  const [existing] = await db
    .select()
    .from(schema.host)
    .where(and(eq(schema.host.namespace, "edch"), eq(schema.host.hostname, h.hostname)));
  if (existing) {
    const [updated] = await db
      .update(schema.host)
      .set({
        kind: h.kind,
        location: h.location ?? null,
        notes: h.notes ?? null,
        metadata: h.metadata ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.host.id, existing.id))
      .returning();
    console.log(`~ host: ${h.hostname}`);
    return updated;
  }
  const [row] = await db
    .insert(schema.host)
    .values({ ...h, namespace: "edch" })
    .returning();
  console.log(`+ host: ${h.hostname}`);
  return row;
}

type DependencyKind =
  | "service-uses-db"
  | "service-uses-aai"
  | "service-depends-on-service"
  | "service-runs-on-host";

async function ensureDependency(
  fromId: string,
  toId: string,
  kind: DependencyKind,
  notes?: string,
) {
  await db
    .insert(schema.dependency)
    .values({
      fromId,
      toId,
      kind,
      namespace: "edch",
      notes: notes ?? null,
    })
    .onConflictDoNothing()
    .execute();
}

async function main() {
  // ---- Owners -----------------------------------------------------------
  const tech = await upsertOwner("EDCH Technical Coordination", "ops@example.invalid");

  // ---- Hosts ------------------------------------------------------------
  const pcss = await upsertHost({
    hostname: "Example PaaS",
    kind: "external",
    location: "Example Region (Example PaaS provider)",
    notes:
      "OKD-based PaaS. EDCH project namespace: example-edch-project on example-paas.invalid. " +
      "Hosts the Drupal-based CAP and Registry services.",
    metadata: {
      kind_detail: "okd-paas",
      okd_cluster: "example-paas.invalid",
      project_namespace: "example-edch-project",
    },
  });

  const icm = await upsertHost({
    hostname: "Example Partner",
    kind: "external",
    location: "Example Region (illustrative partner infra)",
    notes: "Partner-managed infrastructure. Operates the Diamond Discovery Hub.",
  });

  const discourseVendor = await upsertHost({
    hostname: "Discourse Vendor Cloud",
    kind: "external",
    location: "Vendor-managed (Discourse hosting)",
    notes:
      "Managed Discourse hosting for the EDCH community forum at demo-forum.example.invalid. " +
      "Theme: Example Theme with custom user fields for Registry-organisation tagging.",
  });

  // ---- Services ---------------------------------------------------------
  const registry = await upsertService({
    name: "Registry",
    description:
      "EDCH Registry — Drupal-based catalogue of Diamond OA Publishers, Service " +
      "Providers, and Tools & Technology Providers. Main entry point into the EDCH " +
      "network; profile management, organisation ownership claims, geofield-driven " +
      "map views.",
    lifecycleState: "production",
    ownerId: tech.id,
    repoUrl: "https://github.com/example-org/demo-registry",
    metadata: {
      component: "Forum & Registry",
      primary_url: "https://demo-registry.example.invalid",
      legacy_url: "https://demo-registry-legacy.example.invalid",
      stack: "Drupal · PHP 8.3 · Nginx · MariaDB",
      origin: "Example Vendor (developer), OPERAS (operator)",
    },
  });

  const cap = await upsertService({
    name: "CAP",
    description:
      "EDCH Common Access Point — Drupal-based main entry site for the European " +
      "Diamond Capacity Hub. Provides navigation across EDCH services and the " +
      "federated sign-on path planned in ADR-0003.",
    lifecycleState: "production",
    ownerId: tech.id,
    metadata: {
      component: null,
      primary_url: "https://demo-cap.example.invalid",
      test_url: "https://demo-cap.example.invalid",
      stack: "Drupal",
      origin: "Example Vendor (developer), OPERAS (operator)",
    },
  });

  const forum = await upsertService({
    name: "Forum",
    description:
      "EDCH community forum — Discourse instance for discussion, announcements " +
      "and Q&A. Custom user fields capture Registry-organisation affiliation " +
      "during sign-up (planned: automation via Registry → Discourse linking).",
    lifecycleState: "production",
    ownerId: tech.id,
    metadata: {
      component: "Forum & Registry",
      primary_url: "https://demo-forum.example.invalid",
      stack: "Discourse · Example Theme",
    },
  });

  const ddh = await upsertService({
    name: "DDH",
    description:
      "Diamond Discovery Hub — discovery service for Diamond OA journals. " +
      "Exposes both an API (for upstream Diamond-journal feeds) and a web UI " +
      "(Example-partner-managed editorial path for non-fully-Diamond journals). Originally " +
      "delivered under CRAFT-OA.",
    lifecycleState: "production",
    ownerId: tech.id,
    metadata: {
      component: "Diamond Discovery Hub",
      operator: "Example Partner (with EDCH coordination)",
      docs: "Example Discovery Hub Confluence workspace",
    },
  });

  const handbook = await upsertService({
    name: "Handbook",
    description:
      "EDCH living handbook — public documentation surface for EDCH governance, " +
      "service-operation guidelines and onboarding material.",
    lifecycleState: "planned",
    ownerId: tech.id,
    metadata: {
      component: "Resources & Guidelines",
    },
  });

  const selfAssessment = await upsertService({
    name: "Self-assessment tool",
    description:
      "Diamond OA self-assessment tool — guided questionnaire for Diamond OA " +
      "publishers and service providers to evaluate alignment with the Diamond " +
      "OA Standard. Externally developed; no Trivy dependency (per supply-chain " +
      "vetting).",
    lifecycleState: "production",
    ownerId: tech.id,
    metadata: {
      component: "Diamond OA Standard",
      operator: "External development team",
    },
  });

  const training = await upsertService({
    name: "Training",
    description:
      "EDCH Training Platform — Moodle 4.5 LTS instance. OIDC/OAuth2 integration " +
      "with the EDCH AAI is planned (target: before Moodle 5.0 LTS upgrade by " +
      "end of 2026).",
    lifecycleState: "production",
    ownerId: tech.id,
    metadata: {
      component: "Training Platform",
      stack: "Moodle 4.5.2 LTS",
      planned_upgrade: "Moodle 5.0 LTS, target end-2026",
    },
  });

  const publishingTools = await upsertService({
    name: "Publishing Tools",
    description:
      "EDCH Publishing Tools — service-group placeholder covering publishing-side " +
      "tooling recommended by the EDCH (OJS, Janeway, etc.). Concrete services in " +
      "this group land as separate rows as they get formalised.",
    lifecycleState: "planned",
    ownerId: tech.id,
    metadata: {
      component: "Publishing Tools",
    },
  });

  // ---- Dependencies -----------------------------------------------------
  await ensureDependency(
    cap.id,
    pcss.id,
    "service-runs-on-host",
    "Drupal app deployed in OKD project example-edch-project.",
  );
  await ensureDependency(
    registry.id,
    pcss.id,
    "service-runs-on-host",
    "Drupal app deployed alongside CAP in the same OKD project.",
  );
  await ensureDependency(
    ddh.id,
    icm.id,
    "service-runs-on-host",
    "Example-partner-operated infrastructure.",
  );
  await ensureDependency(
    forum.id,
    discourseVendor.id,
    "service-runs-on-host",
    "Vendor-managed Discourse hosting.",
  );

  // Silence unused-variable warning for services we don't yet wire deps for.
  void handbook;
  void selfAssessment;
  void training;
  void publishingTools;
  void sql; // exported in case follow-up ops want raw SQL escape hatch
}

try {
  await main();
} finally {
  await client.end();
}
