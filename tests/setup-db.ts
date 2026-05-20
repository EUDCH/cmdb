/**
 * Test DB setup — drops the public schema, applies every `migrations/*.sql`
 * in lexicographic order, then inserts a deterministic fixture.
 *
 * Run before the integration tests start (the workflow's `Apply migration +
 * seed test fixture` step). The migration loop keeps the test DB aligned
 * with whatever production runs; hardcoding a single migration would let
 * the test schema silently drift once migration 0002+ lands. The fixture
 * is intentionally small and stable so route-level assertions can hard-
 * code expected values without coupling to `db/seed.ts` (which is for
 * demo data and will grow over time).
 *
 * Fixture: 1 owner, 3 services (one per relevant lifecycle state), 2 hosts,
 * 1 dependency. Two of the three services carry `security_contacts` metadata
 * (with an intentional overlap to exercise dedup); the third has NULL
 * metadata to exercise the without-contacts path. Adjust deliberately when
 * a test needs new coverage; if you find yourself adding rows just to make
 * an assertion pass, the assertion is testing the wrong thing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

/**
 * Strip any embedded credentials from a Postgres URL before logging it,
 * so a safety-guard refusal doesn't leak a password into CI logs or
 * pasted output. Falls back to "<unparseable URL>" if the URL doesn't
 * parse cleanly.
 */
function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = "***";
      u.password = "***";
    }
    return u.toString();
  } catch {
    return "<unparseable URL>";
  }
}

// Safety guard — this script DROPs the public schema. The target database
// name must explicitly end in `_test` or `_ci` (case-insensitive). No CI
// bypass: even in CI the workflow must point DATABASE_URL at a *_test or
// *_ci database, so a misconfigured workflow can't silently wipe a
// production-shaped DB. The only escape hatch is an explicit
// CMDB_ALLOW_DESTRUCTIVE_RESET=1 override, intended for one-off recovery
// scenarios; never set it in normal local or CI flows.
//
// Earlier iteration used /test|ci/i which matched names like "capacity"
// or "incident"; the strict suffix-with-underscore regex below avoids
// false positives.
const TEST_DB_NAME = /^[a-z][a-z0-9_]*_(test|ci)$/i;

// Parse the URL properly to get the DB name. String-splitting on `/` would
// extract `user:password@host:5432` from a path-less URL like
// `postgresql://user:pw@host:5432` and the dbName would then carry
// credentials into log output even though redactUrl() redacts the URL
// itself. `.pathname` returns "/cmdb_test" for the well-formed case and
// the empty string when there's no path — strip the leading slash.
function parseDbName(raw: string): string {
  try {
    const pathname = new URL(raw).pathname;
    return pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

const dbName = parseDbName(url);
const looksLikeTestDb = TEST_DB_NAME.test(dbName);
const explicitOverride = process.env.CMDB_ALLOW_DESTRUCTIVE_RESET === "1";

if (!looksLikeTestDb && !explicitOverride) {
  console.error(
    `Refusing to reset schema on DATABASE_URL=${redactUrl(url)}\n` +
      `  - database name "${dbName}" does not match /^[a-z][a-z0-9_]*_(test|ci)$/i\n` +
      `  - CMDB_ALLOW_DESTRUCTIVE_RESET is not "1"\n` +
      `\n` +
      `For local integration testing, point DATABASE_URL at a dedicated test\n` +
      `database whose name ends in \`_test\` (e.g.\n` +
      `\`postgresql://cmdb:cmdb@localhost:5432/cmdb_test\`).\n` +
      `Create it once with:\n` +
      `  docker exec cmdb-postgres psql -U cmdb -d cmdb -c "CREATE DATABASE cmdb_test;"\n` +
      `\n` +
      `In CI, set the workflow's DATABASE_URL to a *_test or *_ci database\n` +
      `(see \`.github/workflows/ci.yml\`).\n` +
      `\n` +
      `To override (NOT recommended — will DROP SCHEMA on the target DB):\n` +
      `  CMDB_ALLOW_DESTRUCTIVE_RESET=1 bun run tests/setup-db.ts`,
  );
  process.exit(1);
}

// max: 1 — applying migrations + fixture sequentially on a single connection
// keeps ordering deterministic and matches the production runner's pool size
// (db/migrate.ts uses max: 1 to keep transaction semantics simple). The
// migration files themselves no longer carry top-level BEGIN/COMMIT (the
// production runner wraps each file in `sql.begin(...)`); setup-db.ts here
// applies them via `sql.unsafe(...)` autocommit, which is fine for the
// idempotent DDL the schema uses.
const sql = postgres(url, { max: 1, onnotice: () => {} });

async function main() {
  console.log("Resetting schema…");
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");

  // Apply every migration in `migrations/` in lexicographic order, so the
  // test DB stays aligned with whatever schema production runs. Hardcoding
  // `0001_init.sql` would silently let the test DB lag once migration 0002
  // landed, and route tests could pass against a stale schema.
  const migrationsDir = join(import.meta.dir, "..", "migrations");
  const migrationFiles = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (migrationFiles.length === 0) {
    console.error(`No *.sql files found in ${migrationsDir}`);
    process.exit(1);
  }
  for (const file of migrationFiles) {
    console.log(`Applying migration ${file}…`);
    const migration = readFileSync(join(migrationsDir, file), "utf8");
    await sql.unsafe(migration);
  }

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
       '{"component": "Forum & Registry",
         "security_contacts": ["alpha-security@example.invalid",
                               "shared-security@example.invalid"],
         "security_contacts_source": "default"}'::jsonb),
      ('33333333-3333-3333-3333-333333333332', 'edch', 'Test Bravo',
       'Staging fixture service.', 'staging',
       '11111111-1111-1111-1111-111111111111',
       '{"component": "Diamond Discovery Hub",
         "security_contacts": ["bravo-security@example.invalid",
                               "shared-security@example.invalid"],
         "security_contacts_source": "vetted"}'::jsonb),
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
