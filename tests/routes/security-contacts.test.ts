/**
 * Route integration test — GET /security-contacts.
 *
 * Preconditions: same as services.test.ts — SSR server reachable on
 * TEST_BASE_URL (default http://127.0.0.1:4322) with the deterministic
 * fixture applied via tests/setup-db.ts.
 *
 * Fixture provides:
 *   - Test Alpha   : security_contacts=[alpha-…, shared-…], source=default
 *   - Test Bravo   : security_contacts=[bravo-…, shared-…], source=vetted
 *   - Test Charlie : metadata=NULL (no security_contacts)
 *
 * Expected dedup: 3 unique addresses across 4 entries (shared-security appears
 * twice). Service Test Charlie must not appear in the per-service table.
 */
import { describe, expect, test } from "bun:test";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://127.0.0.1:4322";

let serverReachable = false;
try {
  await fetch(`${BASE_URL}/security-contacts`, { signal: AbortSignal.timeout(2000) });
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

async function fetchSecurityContacts(): Promise<{ status: number; html: string; contentType: string }> {
  const res = await fetch(`${BASE_URL}/security-contacts`);
  return {
    status: res.status,
    html: await res.text(),
    contentType: res.headers.get("content-type") ?? "",
  };
}

describe.skipIf(!serverReachable)("GET /security-contacts", () => {
  test("returns 200 with HTML content-type", async () => {
    const { status, contentType } = await fetchSecurityContacts();
    expect(status).toBe(200);
    expect(contentType).toContain("text/html");
  });

  test("renders the page heading and per-service table headers", async () => {
    const { html } = await fetchSecurityContacts();
    // This page carries a scoped `<style>` block, so Astro decorates every
    // tag with `data-astro-cid-*` attributes — `<h2>X</h2>` becomes
    // `<h2 data-astro-cid-…>X</h2>`. Match the inner-text shape, not the
    // exact opening tag, so the assertion survives Astro's scoped-style
    // injection (which is gated by the presence of a page-local <style>).
    expect(html).toMatch(/<h2[^>]*>Security contacts<\/h2>/);
    for (const header of ["Service", "Source", "Contacts"]) {
      expect(html).toMatch(new RegExp(`<th[^>]*>${header}</th>`));
    }
  });

  test("reports correct counts in section headings", async () => {
    const { html } = await fetchSecurityContacts();
    expect(html).toContain("Flat unique list (3)");
    expect(html).toContain("Per service (2)");
  });

  test("lists each unique address once in the flat list", async () => {
    const { html } = await fetchSecurityContacts();
    for (const email of [
      "alpha-security@example.invalid",
      "bravo-security@example.invalid",
      "shared-security@example.invalid",
    ]) {
      expect(html).toContain(`mailto:${email}`);
    }
  });

  test("renders a 'Compose to all (BCC)' mailto button with every address as BCC", async () => {
    const { html } = await fetchSecurityContacts();
    expect(html).toContain("Compose to all (BCC)");
    // bcc list is the sorted unique set, comma-joined.
    expect(html).toContain(
      "mailto:?bcc=alpha-security@example.invalid,bravo-security@example.invalid,shared-security@example.invalid",
    );
  });

  test("renders the source pill for both vetted and default services", async () => {
    const { html } = await fetchSecurityContacts();
    expect(html).toContain('pill-source default');
    expect(html).toContain('pill-source vetted');
  });

  test("includes services that have contacts and excludes those that don't", async () => {
    const { html } = await fetchSecurityContacts();
    expect(html).toContain("Test Alpha");
    expect(html).toContain("Test Bravo");
    // Test Charlie has metadata=NULL → no security_contacts → must not appear in
    // the per-service table. Regex on `<strong …>Test Charlie</strong>`
    // (attribute-tolerant per the scoped-style note above) rather than the
    // bare name, because "Charlie" could occur elsewhere on the page in
    // future copy.
    expect(html).not.toMatch(/<strong[^>]*>Test Charlie<\/strong>/);
  });
});
