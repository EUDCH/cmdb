/**
 * Unit tests — src/lib/auth.ts
 *
 * Pure resolvers + the security-critical `sanitizeNext` (open-redirect
 * prevention on the OIDC login flow's ?next= param). No infrastructure
 * needed; `getAuthMode` reads `process.env.AUTH_MODE` directly so the
 * tests just mutate `process.env` before each call.
 *
 * Not covered here (intentionally):
 * - getOidcConfig() — module-level cached Promise, harder to test in
 *   isolation; better as an integration test once OIDC paths land
 * - getRedirectUri() — trivial env read, covered implicitly by the
 *   OIDC integration test when that exists
 */
import { describe, expect, test, afterEach } from "bun:test";
import { getAuthMode, sanitizeNext } from "~/lib/auth";

describe("getAuthMode", () => {
  const original = process.env.AUTH_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = original;
  });

  test("defaults to 'oidc' when AUTH_MODE is unset", () => {
    delete process.env.AUTH_MODE;
    expect(getAuthMode()).toBe("oidc");
  });

  test("returns 'dev' for AUTH_MODE=dev", () => {
    process.env.AUTH_MODE = "dev";
    expect(getAuthMode()).toBe("dev");
  });

  test("trims whitespace and lowercases — 'DEV  ' → 'dev'", () => {
    process.env.AUTH_MODE = "DEV  ";
    expect(getAuthMode()).toBe("dev");
  });

  test("returns 'oidc' for any non-'dev' value (typo-safe; no silent fallback to dev)", () => {
    // Critical: a typo like "deve" or "developement" must NOT silently
    // activate dev mode in production. The resolver is allowlist-style.
    for (const v of ["oidc", "deve", "developement", "production", "1", "true", "yes"]) {
      process.env.AUTH_MODE = v;
      expect(getAuthMode()).toBe("oidc");
    }
  });
});

describe("sanitizeNext (open-redirect prevention)", () => {
  test("returns '/' for null", () => {
    expect(sanitizeNext(null)).toBe("/");
  });

  test("returns '/' for undefined", () => {
    expect(sanitizeNext(undefined)).toBe("/");
  });

  test("returns '/' for empty string", () => {
    expect(sanitizeNext("")).toBe("/");
  });

  test("passes through a valid same-origin absolute path", () => {
    expect(sanitizeNext("/services")).toBe("/services");
    expect(sanitizeNext("/hosts?filter=x")).toBe("/hosts?filter=x");
    expect(sanitizeNext("/auth/callback")).toBe("/auth/callback");
  });

  test("rejects schemed URLs (https://evil.com) — returns '/'", () => {
    expect(sanitizeNext("https://evil.com")).toBe("/");
    expect(sanitizeNext("http://evil.com/path")).toBe("/");
    expect(sanitizeNext("javascript:alert(1)")).toBe("/");
  });

  test("rejects protocol-relative URLs (//evil.com) — returns '/'", () => {
    // Without this guard, a "Location: //evil.com" redirect would
    // route the user to evil.com on the current scheme.
    expect(sanitizeNext("//evil.com")).toBe("/");
    expect(sanitizeNext("//evil.com/path")).toBe("/");
  });

  test("rejects non-slash-prefixed paths — returns '/'", () => {
    expect(sanitizeNext("services")).toBe("/");
    expect(sanitizeNext("./relative")).toBe("/");
    expect(sanitizeNext("../escape")).toBe("/");
  });
});
