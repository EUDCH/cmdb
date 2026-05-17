/**
 * Route integration test — GET /services.
 *
 * Preconditions: the SSR server must be reachable at TEST_BASE_URL (default
 * http://127.0.0.1:4321) and `tests/setup-db.ts` must have applied the
 * deterministic fixture against the same database the server is connected
 * to. The CI workflow's `test` job handles both. For local runs, see the
 * "Running integration tests locally" block in AGENTS.md.
 *
 * If the server isn't reachable when the suite starts, every test is
 * skipped with a clear console message rather than failing — so a bare
 * `bun test` on a fresh clone (without the integration stack up) doesn't
 * produce confusing failures.
 */
import { beforeAll, describe, expect, test } from "bun:test";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4321";

let serverReachable = false;

beforeAll(async () => {
  try {
    const res = await fetch(`${BASE_URL}/services`, {
      signal: AbortSignal.timeout(2000),
    });
    serverReachable = res.ok;
  } catch {
    serverReachable = false;
  }
  if (!serverReachable) {
    console.warn(
      `\n[skip] Integration tests need the SSR server at ${BASE_URL}.\n` +
        `       Bring it up locally with the steps in AGENTS.md → Running integration tests locally.\n` +
        `       Skipping this suite.\n`,
    );
  }
});

async function fetchServices(): Promise<{ status: number; html: string; contentType: string }> {
  const res = await fetch(`${BASE_URL}/services`);
  return {
    status: res.status,
    html: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
  };
}

const integrationTest = (name: string, fn: () => Promise<void>) =>
  test(name, async () => {
    if (!serverReachable) return;
    await fn();
  });

describe("GET /services", () => {
  integrationTest("returns 200 with HTML content-type", async () => {
    const { status, contentType } = await fetchServices();
    expect(status).toBe(200);
    expect(contentType).toContain("text/html");
  });

  integrationTest("renders the services table with expected headers", async () => {
    const { html } = await fetchServices();
    expect(html).toContain("<h2>Services</h2>");
    for (const header of ["Namespace", "Name", "EDCH component", "Lifecycle", "Description"]) {
      expect(html).toContain(`<th>${header}</th>`);
    }
  });

  integrationTest("lists every fixture service by name", async () => {
    const { html } = await fetchServices();
    for (const name of ["Test Alpha", "Test Bravo", "Test Charlie"]) {
      expect(html).toContain(name);
    }
  });

  integrationTest("reports the correct fixture row count", async () => {
    const { html } = await fetchServices();
    expect(html).toContain("3 services in inventory.");
  });

  integrationTest("renders lifecycle pills for every fixture state", async () => {
    const { html } = await fetchServices();
    for (const state of ["production", "staging", "planned"]) {
      expect(html).toContain(`pill-lifecycle ${state}`);
    }
  });

  integrationTest(
    "renders the brand-component column with a value for services that have one and a dash for those that don't",
    async () => {
      const { html } = await fetchServices();
      expect(html).toContain("Forum &amp; Registry");
      expect(html).toContain("Diamond Discovery Hub");
      // Test Charlie has metadata = NULL → componentOf returns null → muted dash.
      expect(html).toMatch(/Test Charlie[\s\S]*?<span class="muted">—<\/span>/);
    },
  );
});
