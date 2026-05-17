/**
 * Route integration test — GET /services.
 *
 * Assumes the SSR server is already running on http://127.0.0.1:4321 (the
 * CI workflow's `Start server` step boots it) and that `tests/setup-db.ts`
 * has applied migration 0001 + the deterministic 3-service fixture.
 */
import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4321";

async function fetchServices(): Promise<{ status: number; html: string; contentType: string }> {
  const res = await fetch(`${BASE_URL}/services`);
  return {
    status: res.status,
    html: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
  };
}

describe("GET /services", () => {
  test("returns 200 with HTML content-type", async () => {
    const { status, contentType } = await fetchServices();
    expect(status).toBe(200);
    expect(contentType).toContain("text/html");
  });

  test("renders the services table with expected headers", async () => {
    const { html } = await fetchServices();
    expect(html).toContain("<h2>Services</h2>");
    for (const header of ["Namespace", "Name", "EDCH component", "Lifecycle", "Description"]) {
      expect(html).toContain(`<th>${header}</th>`);
    }
  });

  test("lists every fixture service by name", async () => {
    const { html } = await fetchServices();
    for (const name of ["Test Alpha", "Test Bravo", "Test Charlie"]) {
      expect(html).toContain(name);
    }
  });

  test("reports the correct fixture row count", async () => {
    const { html } = await fetchServices();
    expect(html).toContain("3 services in inventory.");
  });

  test("renders lifecycle pills for every fixture state", async () => {
    const { html } = await fetchServices();
    for (const state of ["production", "staging", "planned"]) {
      expect(html).toContain(`pill-lifecycle ${state}`);
    }
  });

  test("renders the brand-component column with a value for services that have one and a dash for those that don't", async () => {
    const { html } = await fetchServices();
    expect(html).toContain("Forum &amp; Registry");
    expect(html).toContain("Diamond Discovery Hub");
    // Test Charlie has metadata = NULL → componentOf returns null → muted dash.
    expect(html).toMatch(/Test Charlie[\s\S]*?<span class="muted">—<\/span>/);
  });
});
