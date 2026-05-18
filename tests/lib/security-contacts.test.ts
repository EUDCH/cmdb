/**
 * Unit tests — src/lib/security-contacts.ts
 *
 * Pure aggregation + mailto-encoding helpers. No DB, no SSR; the
 * route integration test in tests/routes/security-contacts.test.ts
 * covers the HTML rendering layer on top of these primitives.
 */
import { describe, expect, test } from "bun:test";
import {
  aggregateSecurityContacts,
  encodeMailtoAddress,
  mailtoForAddress,
  mailtoForBcc,
  securityContactsOf,
  securityContactsSourceOf,
} from "~/lib/security-contacts";

describe("securityContactsOf", () => {
  test("returns [] for null / undefined / non-object metadata", () => {
    expect(securityContactsOf(null)).toEqual([]);
    expect(securityContactsOf(undefined)).toEqual([]);
    expect(securityContactsOf("string")).toEqual([]);
    expect(securityContactsOf(42)).toEqual([]);
  });

  test("returns [] when `security_contacts` is absent or non-array", () => {
    expect(securityContactsOf({})).toEqual([]);
    expect(securityContactsOf({ security_contacts: null })).toEqual([]);
    expect(securityContactsOf({ security_contacts: "x@y.invalid" })).toEqual([]);
  });

  test("drops non-string entries", () => {
    expect(
      securityContactsOf({ security_contacts: ["a@b.invalid", 42, null, "c@d.invalid"] }),
    ).toEqual(["a@b.invalid", "c@d.invalid"]);
  });

  test("trims surrounding whitespace and drops entries that are empty after trim", () => {
    expect(
      securityContactsOf({
        security_contacts: ["  a@b.invalid  ", "   ", "\t\n", "c@d.invalid"],
      }),
    ).toEqual(["a@b.invalid", "c@d.invalid"]);
  });
});

describe("securityContactsSourceOf", () => {
  test("returns null when source is absent / non-string", () => {
    expect(securityContactsSourceOf(null)).toBeNull();
    expect(securityContactsSourceOf({})).toBeNull();
    expect(securityContactsSourceOf({ security_contacts_source: 42 })).toBeNull();
  });

  test("returns the known source verbatim", () => {
    expect(securityContactsSourceOf({ security_contacts_source: "vetted" })).toBe("vetted");
    expect(securityContactsSourceOf({ security_contacts_source: "default" })).toBe("default");
  });

  test("returns null for unknown source values (typo / future vocabulary)", () => {
    // Defensive narrowing — the route uses the return value as a CSS class,
    // so anything outside the known vocabulary must collapse to null rather
    // than render an unstyled `pill-source <whatever>` pill.
    expect(securityContactsSourceOf({ security_contacts_source: "approved" })).toBeNull();
    expect(securityContactsSourceOf({ security_contacts_source: "" })).toBeNull();
    expect(securityContactsSourceOf({ security_contacts_source: "VETTED" })).toBeNull();
  });
});

describe("encodeMailtoAddress / mailtoForAddress", () => {
  test("percent-encodes reserved mailto characters", () => {
    // RFC 6068 reserved set: `?`, `&`, `=`, `#`, space, and friends would
    // otherwise be interpreted as mailto query separators / extra headers.
    expect(encodeMailtoAddress("user?inject=true@x.invalid")).toBe(
      "user%3Finject%3Dtrue%40x.invalid",
    );
    expect(encodeMailtoAddress("a&b@x.invalid")).toBe("a%26b%40x.invalid");
    expect(encodeMailtoAddress("name with space@x.invalid")).toBe(
      "name%20with%20space%40x.invalid",
    );
  });

  test("mailtoForAddress always carries the `mailto:` prefix", () => {
    expect(mailtoForAddress("a@b.invalid")).toBe("mailto:a%40b.invalid");
  });
});

describe("mailtoForBcc", () => {
  test("returns null on empty input", () => {
    expect(mailtoForBcc([])).toBeNull();
  });

  test("percent-encodes each address and joins them with literal commas", () => {
    // Per RFC 6068 §3, commas separate addresses in a mailbox-list and
    // stay unencoded; only the address octets need percent-encoding.
    expect(mailtoForBcc(["a@x.invalid", "b@x.invalid"])).toBe(
      "mailto:?bcc=a%40x.invalid,b%40x.invalid",
    );
  });

  test("encoding survives addresses carrying mailto-reserved characters", () => {
    expect(mailtoForBcc(["a?x=1@x.invalid", "b&c@x.invalid"])).toBe(
      "mailto:?bcc=a%3Fx%3D1%40x.invalid,b%26c%40x.invalid",
    );
  });
});

describe("aggregateSecurityContacts", () => {
  test("returns empty shape when no service has contacts", () => {
    // Empty-state branch coverage for the route: when every service has
    // metadata without security_contacts, the page must collapse to the
    // empty-state copy. The route integration test exercises the HTML
    // half of this guarantee; this assertion locks the data shape.
    const result = aggregateSecurityContacts([
      { name: "Alpha", metadata: null },
      { name: "Bravo", metadata: { component: "X" } },
      { name: "Charlie", metadata: { security_contacts: [] } },
    ]);
    expect(result.withContacts).toEqual([]);
    expect(result.flatUnique).toEqual([]);
    expect(result.mailtoAll).toBeNull();
  });

  test("dedups + sorts addresses across services", () => {
    const result = aggregateSecurityContacts([
      {
        name: "Alpha",
        metadata: {
          security_contacts: ["alpha@x.invalid", "shared@x.invalid"],
          security_contacts_source: "default",
        },
      },
      {
        name: "Bravo",
        metadata: {
          security_contacts: ["bravo@x.invalid", "shared@x.invalid"],
          security_contacts_source: "vetted",
        },
      },
    ]);
    expect(result.flatUnique).toEqual([
      "alpha@x.invalid",
      "bravo@x.invalid",
      "shared@x.invalid",
    ]);
    expect(result.withContacts.map((s) => s.name)).toEqual(["Alpha", "Bravo"]);
    expect(result.withContacts.map((s) => s.source)).toEqual(["default", "vetted"]);
    expect(result.mailtoAll).toBe(
      "mailto:?bcc=alpha%40x.invalid,bravo%40x.invalid,shared%40x.invalid",
    );
  });

  test("excludes services whose contacts collapse to empty after normalization", () => {
    // Whitespace-only entries shouldn't promote a service into withContacts.
    const result = aggregateSecurityContacts([
      { name: "Empty", metadata: { security_contacts: ["  ", "\t"] } },
      { name: "Real", metadata: { security_contacts: ["x@y.invalid"] } },
    ]);
    expect(result.withContacts.map((s) => s.name)).toEqual(["Real"]);
    expect(result.flatUnique).toEqual(["x@y.invalid"]);
  });

  test("collapses unknown source values to null", () => {
    const result = aggregateSecurityContacts([
      {
        name: "Alpha",
        metadata: {
          security_contacts: ["a@x.invalid"],
          security_contacts_source: "approved",
        },
      },
    ]);
    expect(result.withContacts[0]?.source).toBeNull();
  });
});
