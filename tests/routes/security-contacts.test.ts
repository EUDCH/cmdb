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
import { afterAll, describe, expect, test } from "bun:test";
import postgres from "postgres";

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

/**
 * Slice the rendered HTML down to just the `<section id="flat-list">` block.
 * Scopes flat-list assertions so they can't be silently satisfied by the
 * same `mailto:` strings rendered again in the per-service table.
 *
 * Regex matchers tolerate Astro's scoped-style `data-astro-cid-*` attribute
 * landing on either side of the `id=` attribute — same robustness pattern
 * as the heading-assertion regex in the headers test above.
 */
function sliceFlatListSection(html: string): string {
  const startRe = /<section[^>]*\bid="flat-list"[^>]*>/;
  const endRe = /<section[^>]*\bid="per-service"[^>]*>/;
  const startMatch = html.match(startRe);
  if (!startMatch || startMatch.index === undefined) {
    throw new Error("flat-list section not found in HTML");
  }
  const start = startMatch.index;
  const tail = html.slice(start);
  const endMatch = tail.match(endRe);
  if (!endMatch || endMatch.index === undefined) {
    throw new Error("per-service section not found after flat-list");
  }
  return tail.slice(0, endMatch.index);
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

  test("lists each unique address once in the flat-list section only", async () => {
    const { html } = await fetchSecurityContacts();
    const flatList = sliceFlatListSection(html);
    // Addresses are percent-encoded in the href; `@` → `%40` per RFC 6068.
    // Asserting against the encoded form prevents a regression where the
    // encoding helper is bypassed and raw `@` ends up in the href again.
    for (const email of [
      "alpha-security@example.invalid",
      "bravo-security@example.invalid",
      "shared-security@example.invalid",
    ]) {
      const encoded = encodeURIComponent(email);
      expect(flatList).toContain(`mailto:${encoded}`);
      // Each address must appear exactly once in the flat list — once-per-
      // unique enforces the dedup contract the section advertises.
      const occurrences = flatList.split(`mailto:${encoded}`).length - 1;
      expect(occurrences).toBe(1);
    }
  });

  test("renders a 'Compose to all (BCC)' mailto button with every address as BCC", async () => {
    const { html } = await fetchSecurityContacts();
    expect(html).toContain("Compose to all (BCC)");
    // bcc list is the sorted unique set, each address percent-encoded,
    // joined by literal commas (RFC 6068 §3 — commas separate addresses
    // in a mailbox-list and stay unencoded).
    expect(html).toContain(
      "mailto:?bcc=" +
        ["alpha-security@example.invalid", "bravo-security@example.invalid", "shared-security@example.invalid"]
          .map((e) => encodeURIComponent(e))
          .join(","),
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

/**
 * Empty-state branch coverage. The base fixture always has Alpha + Bravo
 * with contacts, so the no-contacts copy never renders against it. This
 * sub-suite mutates the live test DB to strip every service's metadata,
 * fetches once, asserts the empty-state copy, then restores via afterAll.
 * The restore runs even if the assertions throw, so a failing assertion
 * doesn't leave the fixture in a contacts-less state for later test files.
 *
 * Requires DATABASE_URL — CI sets it for the test job (see
 * .github/workflows/ci.yml). Locally, the integration-test setup in
 * AGENTS.md already requires it for tests/setup-db.ts.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const canMutate = serverReachable && Boolean(DATABASE_URL);

if (serverReachable && !DATABASE_URL) {
  console.warn(
    "\n[skip] Empty-state branch test needs DATABASE_URL to mutate + restore the fixture.\n" +
      "       Skipping the empty-state sub-suite only; the rest of the integration tests still run.\n",
  );
}

describe.skipIf(!canMutate)("GET /security-contacts — empty-state branch", () => {
  // `canMutate` is true here, so DATABASE_URL is defined; cast to string.
  const sql = postgres(DATABASE_URL as string, { max: 1, onnotice: () => {} });
  const saved: { id: string; metadata: unknown }[] = [];

  afterAll(async () => {
    // Restore each row's metadata as it was before the test ran.
    // postgres-js handles a `null` value as SQL NULL inside a tagged template.
    for (const row of saved) {
      await sql`UPDATE service SET metadata = ${row.metadata as never} WHERE id = ${row.id}`;
    }
    await sql.end();
  });

  test("renders empty-state copy when no service has contacts", async () => {
    const snapshot = await sql<{ id: string; metadata: unknown }[]>`SELECT id, metadata FROM service`;
    saved.push(...snapshot);

    await sql`UPDATE service SET metadata = NULL`;

    const { html } = await fetchSecurityContacts();
    expect(html).toContain("No services have security contacts configured yet.");
    // Neither sub-section is rendered in the empty branch — anchoring on
    // the section IDs catches a regression where the empty-state branch
    // accidentally drops only the copy and leaves the structure behind.
    expect(html).not.toContain('id="flat-list"');
    expect(html).not.toContain('id="per-service"');
  });
});
