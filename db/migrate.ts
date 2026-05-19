/**
 * Idempotent migration runner.
 *
 * Applies every `migrations/*.sql` file in lexicographic order, recording
 * each successful application in a `schema_migrations` table inside the
 * target database. Re-runs are no-ops; a failed migration aborts before
 * partial state can land.
 *
 * Invoked by the production `migrate` compose service per ADR-0004; the
 * `cmdb` service waits on `service_completed_successfully` so the app is
 * never serving against a half-applied schema.
 *
 * Why not drizzle-kit migrate: the repo's single migration today
 * (`0001_init.sql`) is hand-written (Postgres ENUMs + triggers +
 * composite indexes) rather than drizzle-generated, so the meta/journal
 * structure drizzle-kit expects doesn't exist. A small runner under our
 * control is one fewer cross-version dependency to keep aligned with the
 * runtime image and matches the per-file lexicographic application that
 * `tests/setup-db.ts` already uses for the test fixture.
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const MIGRATIONS_DIR = resolve(import.meta.dir, "..", "migrations");

const sql = postgres(DATABASE_URL, { max: 1 });

async function main(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const entries = await readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((f) => f.endsWith(".sql")).sort();

  if (sqlFiles.length === 0) {
    console.log("[migrate] no .sql files under migrations/");
    return;
  }

  const appliedRows = await sql<{ filename: string }[]>`
    SELECT filename FROM schema_migrations
  `;
  const applied = new Set(appliedRows.map((r) => r.filename));

  let pendingCount = 0;
  for (const file of sqlFiles) {
    if (applied.has(file)) {
      console.log(`[migrate] skip ${file} (already applied)`);
      continue;
    }
    pendingCount++;
    const content = await readFile(resolve(MIGRATIONS_DIR, file), "utf8");
    console.log(`[migrate] applying ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (filename) VALUES (${file})`;
    });
    console.log(`[migrate] applied ${file}`);
  }

  if (pendingCount === 0) {
    console.log("[migrate] up to date");
  } else {
    console.log(`[migrate] applied ${pendingCount} new migration(s)`);
  }
}

try {
  await main();
} finally {
  await sql.end();
}
