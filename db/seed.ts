/**
 * Idempotent seed for EDCH services.
 *
 * Run with: `bun run db:seed`
 *
 * Re-running is safe: each row is keyed on (namespace, name) and skipped if
 * present. Adjust values in this file and re-run to reflect changes to the
 * canonical inventory; intentional changes will not be applied to existing
 * rows (that path belongs to the future edit UI + audit log).
 */
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL not set — run via `bun run db:seed` from project root");
}

const client = postgres(url, { max: 4 });
const db = drizzle(client, { schema });

async function ensureOwner(name: string, email: string | null) {
  const [existing] = await db
    .select()
    .from(schema.owner)
    .where(and(eq(schema.owner.namespace, "edch"), eq(schema.owner.name, name)));
  if (existing) return existing;
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
  lifecycleState: "planned" | "staging" | "production" | "deprecated" | "retired";
  ownerId: string;
  imsLink?: string;
  monitorLink?: string;
  repoUrl?: string;
};

async function ensureService(svc: ServiceSeed) {
  const [existing] = await db
    .select()
    .from(schema.service)
    .where(and(eq(schema.service.namespace, "edch"), eq(schema.service.name, svc.name)));
  if (existing) return existing;
  const [row] = await db
    .insert(schema.service)
    .values({ ...svc, namespace: "edch" })
    .returning();
  console.log(`+ service: ${svc.name}`);
  return row;
}

async function main() {
  const tech = await ensureOwner("EDCH Technical Coordination", "tech@edch.eu");

  await ensureService({
    name: "Registry",
    description:
      "EDCH Service Registry — canonical catalogue of EDCH services, endpoints and metadata.",
    lifecycleState: "production",
    ownerId: tech.id,
  });

  await ensureService({
    name: "CAP",
    description:
      "EDCH Common Access Point — federated single sign-on entry to EDCH services.",
    lifecycleState: "production",
    ownerId: tech.id,
  });

  await ensureService({
    name: "Forum",
    description:
      "EDCH community forum (Discourse) — discussion, announcements and Q&A for the EDCH community.",
    lifecycleState: "production",
    ownerId: tech.id,
  });
}

try {
  await main();
} finally {
  await client.end();
}
