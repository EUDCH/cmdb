/**
 * GET /health — liveness + DB readiness probe.
 *
 * Returns JSON:
 *   { status: "ok" | "degraded", version: <git-sha-or-unknown>, db: "ok" | "down" }
 *
 * 200 when DB is reachable, 503 when it isn't. The deploy script polls
 * this after `up -d cmdb`; on sustained non-200 it attempts an
 * auto-rollback to the previously-recorded IMAGE_TAG (when one exists)
 * and exits non-zero. An external monitor (Phase 2) probes the same
 * endpoint over HTTPS through Caddy.
 *
 * Version is read from the BUILD_SHA env var that the deploy workflow
 * sets to the current commit SHA. Falls back to "unknown" so the route
 * stays useful in local dev where no SHA is injected.
 */
import type { APIRoute } from "astro";
import { db } from "~/lib/db";
import { sql } from "drizzle-orm";

export const prerender = false;

export const GET: APIRoute = async () => {
  const version = process.env.BUILD_SHA ?? "unknown";
  let dbStatus: "ok" | "down" = "down";

  try {
    await db.execute(sql`SELECT 1`);
    dbStatus = "ok";
  } catch {
    dbStatus = "down";
  }

  const body = {
    status: dbStatus === "ok" ? "ok" : "degraded",
    version,
    db: dbStatus,
  };

  return new Response(JSON.stringify(body), {
    status: dbStatus === "ok" ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
