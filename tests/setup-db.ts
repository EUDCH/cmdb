/**
 * Test DB setup — applies migration 0001 + inserts a deterministic fixture.
 *
 * Run before the integration tests start (the workflow's `Apply migration +
 * seed test fixture` step). The fixture is intentionally small and stable so
 * route-level assertions can hard-code expected values without coupling to
 * `db/seed.ts` (which is for demo data and will grow over time).
 *
 * Fixture: 1 owner, 3 services (one per relevant lifecycle state), 2 hosts,
 * 1 dependency. Adjust deliberately when a test needs new coverage; if you
 * find yourself adding rows just to make an assertion pass, the assertion
 * is testing the wrong thing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

// max: 1 — the migration uses raw BEGIN/COMMIT; postgres-js rejects those
// with UNSAFE_TRANSACTION when pool size > 1.
const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  console.log("Resetting schema…");
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");

  console.log("Applying migration 0001…");
  const migrationPath = join(import.meta.dir, "..", "migrations", "0001_init.sql");
  const migration = readFileSync(migrationPath, "utf8");
  await sql.unsafe(migration);

  console.log("Inserting test fixture…");
  await sql`
    INSERT INTO owner (id, namespace, name, email)
    VALUES ('11111111-1111-1111-1111-111111111111', 'edch', 'Test Owner', 'test@example.invalid')
  `;

  await sql`
    INSERT INTO host (id, namespace, hostname, kind, location)
    VALUES
      ('22222222-2222-2222-2222-222222222222', 'edch', 'test-host-a', 'vm', 'Test Region A'),
      ('22222222-2222-2222-2222-222222222223', 'edch', 'test-host-b', 'external', 'Test Region B')
  `;

  await sql`
    INSERT INTO service (id, namespace, name, description, lifecycle_state, owner_id, metadata)
    VALUES
      ('33333333-3333-3333-3333-333333333331', 'edch', 'Test Alpha',
       'Production fixture service.', 'production',
       '11111111-1111-1111-1111-111111111111',
       '{"component": "Forum & Registry"}'::jsonb),
      ('33333333-3333-3333-3333-333333333332', 'edch', 'Test Bravo',
       'Staging fixture service.', 'staging',
       '11111111-1111-1111-1111-111111111111',
       '{"component": "Diamond Discovery Hub"}'::jsonb),
      ('33333333-3333-3333-3333-333333333333', 'edch', 'Test Charlie',
       'Planned fixture service, no component.', 'planned',
       '11111111-1111-1111-1111-111111111111', NULL)
  `;

  await sql`
    INSERT INTO dependency (from_id, to_id, kind, namespace, notes)
    VALUES (
      '33333333-3333-3333-3333-333333333331',
      '22222222-2222-2222-2222-222222222222',
      'service-runs-on-host', 'edch',
      'Test Alpha runs on test-host-a.'
    )
  `;

  console.log("Test fixture ready: 1 owner, 3 services, 2 hosts, 1 dependency.");
}

try {
  await main();
} finally {
  await sql.end();
}
