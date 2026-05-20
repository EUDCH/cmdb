/**
 * Route integration test — GET /health.
 *
 * Mirrors the skip-or-fail semantics of tests/routes/services.test.ts:
 * locally a missing server is a SKIP, in CI it's a hard failure. Probes
 * the deploy-time contract from ADR-0004 § Decision (Health probe):
 *
 *   - HTTP 200 when the DB is reachable
 *   - application/json content type
 *   - body shape: { status, version, db }
 *   - db: "ok" against the deterministic test fixture
 *
 * The 503 (db down) path is not exercised here — taking the DB down
 * mid-suite would break the rest of the integration tests. The branch
 * is covered by the route's structure (catch → 503); in production the
 * deploy script's auto-rollback path treats sustained non-200 as the
 * trigger to re-up the previous IMAGE_TAG.
 */
import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4322";

let serverReachable = false;
try {
  await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(2000) });
  serverReachable = true;
} catch {
  serverReachable = false;
}

if (!serverReachable) {
  if (process.env.CI === "true") {
    throw new Error(
      `Integration tests cannot reach the SSR server at ${BASE_URL}.\n` +
        `CI must always have the server up before this suite runs — refusing to skip.\n` +
        `Check the workflow's "Start server" / "Wait for server" steps.`,
    );
  }
  console.warn(
    `\n[skip] /health integration test needs the SSR server at ${BASE_URL}.\n` +
      `       Bring it up locally per AGENTS.md → Running integration tests locally.\n` +
      `       Marking this suite as SKIPPED.\n`,
  );
}

describe.skipIf(!serverReachable)("GET /health", () => {
  test("returns 200 with application/json", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("application/json");
  });

  test("body has status, version, db fields", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.status).toBe("string");
    expect(typeof body.version).toBe("string");
    expect(typeof body.db).toBe("string");
  });

  test("reports db ok against the fixture", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.db).toBe("ok");
    expect(body.status).toBe("ok");
  });

  test("sets cache-control: no-store", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.headers.get("cache-control") ?? "").toContain("no-store");
  });
});
