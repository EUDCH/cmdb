import { defineMiddleware } from "astro:middleware";
import { decodeSession, SESSION_COOKIE } from "~/lib/session";
import { DEV_SESSION, getAuthMode } from "~/lib/auth";

// `/health` is intentionally public: the deploy script and any external
// monitor (Phase 2) must be able to probe it without an OIDC session.
// Returns JSON with `{status, version, db}` per ADR-0004 § Decision.
const PUBLIC_PREFIXES = ["/auth/", "/_astro/", "/favicon.ico", "/health"];

function isPublic(pathname: string): boolean {
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
