import type { APIRoute } from "astro";
import * as client from "openid-client";
import {
  getAuthMode,
  getOidcConfig,
  getRedirectUri,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  sanitizeNext,
  type OAuthFlowState,
} from "~/lib/auth";
import { signPayload } from "~/lib/session";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (getAuthMode() === "dev") {
    return new Response("Not Found", { status: 404 });
  }

  const config = await getOidcConfig();
  const state = client.randomState();
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const next = sanitizeNext(url.searchParams.get("next"));

  const flow: OAuthFlowState = {
    state,
    codeVerifier,
    next,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  };

  cookies.set(OAUTH_STATE_COOKIE, signPayload(flow), {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: OAUTH_STATE_TTL_MS / 1000,
  });

  const authorizationUrl = client.buildAuthorizationUrl(config, {
    redirect_uri: getRedirectUri(),
    scope: "openid profile email",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return redirect(authorizationUrl.href, 302);
};
