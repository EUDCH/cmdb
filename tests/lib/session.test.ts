/**
 * Unit tests — src/lib/session.ts
 *
 * Pure functions; no infrastructure. Verifies the HMAC-signed cookie
 * round-trip and the tamper / expiry rejection paths. Sets
 * SESSION_SECRET via process.env before importing the module; Bun maps
 * `import.meta.env` to `process.env` in test contexts.
 *
 * Keep these tests focused on the security-critical paths (tampering,
 * expiration, malformed input) — round-trip alone would not catch a
 * regression that, say, accepted any signature.
 */
process.env.SESSION_SECRET = "x".repeat(48); // ≥ 32 bytes, per getSecret() guard

import { describe, expect, test } from "bun:test";
import {
  decodeSession,
  encodeSession,
  makeSession,
  signPayload,
  SESSION_TTL_MS,
  verifyPayload,
  type Session,
} from "~/lib/session";

describe("signPayload + verifyPayload", () => {
  test("round-trips a simple value", () => {
    const cookie = signPayload({ hello: "world", n: 42 });
    expect(verifyPayload<{ hello: string; n: number }>(cookie)).toEqual({
      hello: "world",
      n: 42,
    });
  });

  test("returns null for undefined input", () => {
    expect(verifyPayload(undefined)).toBeNull();
  });

  test("returns null for input with no dot separator", () => {
    expect(verifyPayload("nodot")).toBeNull();
  });

  test("returns null for input with tampered signature", () => {
    const cookie = signPayload({ x: 1 });
    const dot = cookie.indexOf(".");
    const tampered = `${cookie.slice(0, dot)}.AAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(verifyPayload(tampered)).toBeNull();
  });

  test("returns null for input with tampered payload (signature now mismatches)", () => {
    const cookie = signPayload({ x: 1 });
    const dot = cookie.indexOf(".");
    // Swap a single payload byte; signature should no longer verify.
    const payload = cookie.slice(0, dot);
    const sig = cookie.slice(dot);
    const mutatedPayload = payload.slice(0, -1) + (payload.endsWith("A") ? "B" : "A");
    expect(verifyPayload(mutatedPayload + sig)).toBeNull();
  });
});

describe("encodeSession + decodeSession", () => {
  test("round-trips a Session", () => {
    const s: Session = {
      sub: "user-1",
      email: "a@b.c",
      name: "A",
      groups: ["admin"],
      expiresAt: Date.now() + 60_000,
    };
    expect(decodeSession(encodeSession(s))).toEqual(s);
  });

  test("returns null when expiresAt is in the past", () => {
    const expired: Session = {
      sub: "user-1",
      expiresAt: Date.now() - 1000,
    };
    expect(decodeSession(encodeSession(expired))).toBeNull();
  });

  test("returns null when expiresAt is missing (verifyPayload would round-trip but decodeSession adds the expiry check)", () => {
    // Sign a "session-like" object without expiresAt to confirm decodeSession
    // refuses to treat it as a live session.
    const cookie = signPayload({ sub: "user-1" });
    expect(decodeSession(cookie)).toBeNull();
  });
});

describe("makeSession", () => {
  test("sets expiresAt to roughly now + SESSION_TTL_MS (12h)", () => {
    const before = Date.now();
    const s = makeSession({ sub: "user-1" });
    const after = Date.now();
    expect(s.sub).toBe("user-1");
    expect(s.expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(s.expiresAt).toBeLessThanOrEqual(after + SESSION_TTL_MS);
  });
});
