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
 * Version is read from the BUILD_SHA env var. In production the chain is:
 * `deploy.sh` exports IMAGE_TAG → compose interpolates it into the cmdb
 * container's `BUILD_SHA: ${IMAGE_TAG:-main}` environment → process.env
 * here. Falls back to "unknown" so the route stays useful in local dev
 * where no tag is injected. The route is public (see src/middleware.ts
 * PUBLIC_PREFIXES) so deploy + monitor probes work in OIDC mode too.
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
