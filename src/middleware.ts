import { defineMiddleware } from "astro:middleware";
import { decodeSession, SESSION_COOKIE } from "~/lib/session";
import { DEV_SESSION, getAuthMode } from "~/lib/auth";

// Allowlist split into exact paths and prefixes to keep scope precise.
// `/health` is exact-only: it must be probeable without OIDC by the
// deploy script and any external monitor (Phase 2), but a future
// `/healthz` or `/health/admin` route must NOT inherit the bypass —
// a startsWith match would over-grant. `/favicon.ico` is exact for
// the same reason. `/auth/` and `/_astro/` legitimately cover whole
// subtrees, so they stay as prefixes.
const PUBLIC_EXACT = new Set<string>(["/health", "/favicon.ico"]);
const PUBLIC_PREFIXES = ["/auth/", "/_astro/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const mode = getAuthMode();

  if (mode === "dev") {
    context.locals.session = DEV_SESSION;
    return next();
  }

  if (isPublic(context.url.pathname)) {
    return next();
  }

  const cookie = context.cookies.get(SESSION_COOKIE)?.value;
  const session = decodeSession(cookie);

  if (!session) {
    const next_ = encodeURIComponent(context.url.pathname + context.url.search);
    return context.redirect(`/auth/login?next=${next_}`);
  }

  context.locals.session = session;
  return next();
});
