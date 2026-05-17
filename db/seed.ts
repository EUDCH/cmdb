/**
 * Public demo seed — fictitious inventory.
 *
 * Run with: `bun run db:seed`
 *
 * This seed ships in the public repo and contains *no* real EDCH operational
 * data. Service names, hosts, URLs and ownership are illustrative — they
 * exercise every code path in the model (service / host / dependency /
 * lifecycle states / brand-component metadata) so a fresh clone gets a
 * usable demo on first boot.
 *
 * For the real EDCH inventory, create `db/seed.local.ts` (gitignored)
 * and run `bun run db:seed:local`. The local seed is the deployed
 * source of truth on the tailnet instance; the public seed never runs
 * against production.
 *
 * Upsert semantics: each row is keyed on its natural unique tuple and
 * existing rows are updated to match this file.
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
  const demoOwner = await upsertOwner("Example Operations Team", "ops@example.invalid");

  // ---- Hosts ------------------------------------------------------------
  const paas = await upsertHost({
    hostname: "example-paas",
    kind: "external",
    location: "Example Region (illustrative PaaS provider)",
    notes:
      "Fictitious managed Kubernetes-style platform. Stands in for any partner-" +
      "operated PaaS in the demo inventory.",
    metadata: { kind_detail: "managed-paas" },
  });

  const partnerCloud = await upsertHost({
    hostname: "example-partner-cloud",
    kind: "external",
    location: "Example Region (illustrative partner-managed infrastructure)",
    notes: "Stands in for a sibling-org-operated environment in the demo inventory.",
  });

  const vendorCloud = await upsertHost({
    hostname: "example-vendor-cloud",
    kind: "external",
    location: "Vendor-managed (illustrative SaaS hosting)",
    notes: "Stands in for any vendor-hosted SaaS service in the demo inventory.",
  });

  // ---- Services ---------------------------------------------------------
  // Demo entries — one row per EDCH brand component, plus an access-layer
  // service that sits outside the component scheme. Replace via seed.local.ts
  // for the real inventory.
  const demoRegistry = await upsertService({
    name: "Demo Registry",
    description:
      "Illustrative directory service — demo placeholder for the Forum & Registry " +
      "brand component. Real inventory lives in db/seed.local.ts.",
    lifecycleState: "production",
    ownerId: demoOwner.id,
    metadata: {
      component: "Forum & Registry",
      primary_url: "https://demo-registry.example.invalid",
      stack: "Illustrative stack",
    },
  });

  const demoAccessPoint = await upsertService({
    name: "Demo Access Point",
    description:
      "Illustrative access-layer service — demo placeholder for a federated SSO " +
      "entry point. No brand component; access-layer infrastructure.",
    lifecycleState: "production",
    ownerId: demoOwner.id,
    metadata: {
      component: null,
      primary_url: "https://demo-cap.example.invalid",
    },
  });

  const demoForum = await upsertService({
    name: "Demo Forum",
    description:
      "Illustrative community forum — demo placeholder for the Forum & Registry " +
      "brand component (forum half).",
    lifecycleState: "production",
    ownerId: demoOwner.id,
    metadata: {
      component: "Forum & Registry",
      primary_url: "https://demo-forum.example.invalid",
    },
  });

  const demoDiscovery = await upsertService({
    name: "Demo Discovery",
    description:
      "Illustrative discovery service — demo placeholder for the Diamond Discovery " +
      "Hub brand component.",
    lifecycleState: "production",
    ownerId: demoOwner.id,
    metadata: { component: "Diamond Discovery Hub" },
  });

  const demoHandbook = await upsertService({
    name: "Demo Handbook",
    description:
      "Illustrative documentation surface — demo placeholder for the Resources & " +
      "Guidelines brand component.",
    lifecycleState: "planned",
    ownerId: demoOwner.id,
    metadata: { component: "Resources & Guidelines" },
  });

  const demoStandard = await upsertService({
    name: "Demo Self-assessment",
    description:
      "Illustrative self-assessment questionnaire — demo placeholder for the " +
      "Diamond OA Standard brand component.",
    lifecycleState: "production",
    ownerId: demoOwner.id,
    metadata: { component: "Diamond OA Standard" },
  });

  const demoTraining = await upsertService({
    name: "Demo Training",
    description:
      "Illustrative learning management surface — demo placeholder for the Training " +
      "Platform brand component.",
    lifecycleState: "staging",
    ownerId: demoOwner.id,
    metadata: { component: "Training Platform" },
  });

  const demoTools = await upsertService({
    name: "Demo Publishing Tools",
    description:
      "Illustrative publishing-toolchain service-group — demo placeholder for the " +
      "Publishing Tools brand component.",
    lifecycleState: "planned",
    ownerId: demoOwner.id,
    metadata: { component: "Publishing Tools" },
  });

  // ---- Dependencies -----------------------------------------------------
  await ensureDependency(demoAccessPoint.id, paas.id, "service-runs-on-host");
  await ensureDependency(demoRegistry.id, paas.id, "service-runs-on-host");
  await ensureDependency(demoDiscovery.id, partnerCloud.id, "service-runs-on-host");
  await ensureDependency(demoForum.id, vendorCloud.id, "service-runs-on-host");
  await ensureDependency(
    demoForum.id,
    demoAccessPoint.id,
    "service-uses-aai",
    "Illustrative: forum delegates sign-in to the access point.",
  );
  await ensureDependency(
    demoRegistry.id,
    demoAccessPoint.id,
    "service-uses-aai",
    "Illustrative: registry delegates sign-in to the access point.",
  );

  // Silence unused-variable noise for services we don't yet wire deps for.
  void demoHandbook;
  void demoStandard;
  void demoTraining;
  void demoTools;
  void sql;
}

try {
  await main();
} finally {
  await client.end();
}
