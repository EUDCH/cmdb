/**
 * Route integration test — GET /hosts.
 *
 * Preconditions: the SSR server must be reachable at TEST_BASE_URL (default
 * http://127.0.0.1:4322 — NOT 4321, which is the dev-server port) and
 * `tests/setup-db.ts` must have applied the deterministic fixture against
 * the same database the server is connected to. The CI workflow's `test`
 * job handles both. For local runs, see the "Running integration tests
 * locally" block in AGENTS.md.
 *
 * Mirrors the shape of `services.test.ts` — same skip/hard-fail semantics
 * (skip locally if server unreachable, hard-fail in CI), same reachability
 * probe behavior (any HTTP response = reachable; only network failures
 * trigger the skip). Keep the two test files structurally aligned so the
 * pattern stays repeatable as new routes ship.
 */
import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4322";

let serverReachable = false;
try {
  await fetch(`${BASE_URL}/hosts`, { signal: AbortSignal.timeout(2000) });
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
    `\n[skip] Integration tests need the SSR server at ${BASE_URL}.\n` +
      `       Bring it up locally with the steps in AGENTS.md → Running integration tests locally.\n` +
      `       Marking this suite as SKIPPED.\n`,
  );
}

async function fetchHosts(): Promise<{ status: number; html: string; contentType: string }> {
  const res = await fetch(`${BASE_URL}/hosts`);
  return {
    status: res.status,
    html: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
  };
}

describe.skipIf(!serverReachable)("GET /hosts", () => {
  test("returns 200 with HTML content-type", async () => {
    const { status, contentType } = await fetchHosts();
    expect(status).toBe(200);
    expect(contentType).toContain("text/html");
  });

  test("renders the hosts table with expected headers", async () => {
    const { html } = await fetchHosts();
    expect(html).toContain("<h2>Hosts</h2>");
    for (const header of ["Namespace", "Hostname", "Kind", "Location", "Notes"]) {
      expect(html).toContain(`<th>${header}</th>`);
    }
  });

  test("lists every fixture host by hostname", async () => {
    const { html } = await fetchHosts();
    for (const hostname of ["test-host-a", "test-host-b"]) {
      expect(html).toContain(hostname);
    }
  });

  test("reports the correct fixture row count", async () => {
    const { html } = await fetchHosts();
    expect(html).toContain("2 hosts in inventory.");
  });

  test("renders both fixture host kinds (vm + external)", async () => {
    const { html } = await fetchHosts();
    // Kind is rendered as a plain table cell; assert presence inside <td>
    // to avoid matching the word inside layout text or other columns.
    expect(html).toMatch(/<td>vm<\/td>/);
    expect(html).toMatch(/<td>external<\/td>/);
  });

  test("renders the namespace pill for every fixture host", async () => {
    const { html } = await fetchHosts();
    // 2 fixture rows × 1 pill each = at least 2 occurrences. Use a regex
    // count rather than asserting an exact number, so adding rows to the
    // fixture later doesn't immediately break this assertion.
    const pillMatches = html.match(/<span class="pill">edch<\/span>/g) ?? [];
    expect(pillMatches.length).toBeGreaterThanOrEqual(2);
  });

  test("renders fixture location strings", async () => {
    const { html } = await fetchHosts();
    expect(html).toContain("Test Region A");
    expect(html).toContain("Test Region B");
  });
});
