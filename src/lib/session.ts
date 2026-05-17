import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "cmdb_session";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h, per ADR-0003

export interface Session {
  sub: string;
  email?: string;
  name?: string;
  groups?: string[];
  expiresAt: number;
}

function getSecret(): string {
  const secret = import.meta.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 bytes — see .env.example");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(cookie: string | undefined): Session | null {
  if (!cookie) return null;
  const dot = cookie.indexOf(".");
  if (dot <= 0) return null;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (typeof session.expiresAt !== "number" || session.expiresAt < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function makeSession(claims: {
  sub: string;
  email?: string;
  name?: string;
  groups?: string[];
}): Session {
  return { ...claims, expiresAt: Date.now() + SESSION_TTL_MS };
}
