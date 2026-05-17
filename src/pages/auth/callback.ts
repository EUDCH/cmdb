import type { APIRoute } from "astro";
import * as client from "openid-client";
import {
  getAuthMode,
  getOidcConfig,
  OAUTH_STATE_COOKIE,
  type OAuthFlowState,
} from "~/lib/auth";
import {
  encodeSession,
  makeSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  verifyPayload,
} from "~/lib/session";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (getAuthMode() === "dev") {
    return new Response("Not Found", { status: 404 });
  }

  const stateCookie = cookies.get(OAUTH_STATE_COOKIE)?.value;
  const flow = verifyPayload<OAuthFlowState>(stateCookie);
  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });

  if (!flow || flow.expiresAt < Date.now()) {
    return new Response("Auth flow expired — please sign in again.", { status: 400 });
  }

  const returnedState = url.searchParams.get("state");
  if (returnedState !== flow.state) {
    return new Response("State mismatch.", { status: 400 });
  }

  const config = await getOidcConfig();
  let tokens;
  try {
    tokens = await client.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: flow.state,
    });
  } catch (err) {
    return new Response(
      `Token exchange failed: ${err instanceof Error ? err.message : String(err)}`,
      { status: 502 },
    );
  }

  const claims = tokens.claims();
  if (!claims || typeof claims.sub !== "string") {
    return new Response("ID token missing sub claim.", { status: 502 });
  }

  const groups = Array.isArray(claims.groups)
    ? claims.groups.filter((g): g is string => typeof g === "string")
    : undefined;

  const session = makeSession({
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    name: typeof claims.name === "string" ? claims.name : undefined,
    groups,
  });

  cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });

  return redirect(flow.next, 302);
};
