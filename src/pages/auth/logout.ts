import type { APIRoute } from "astro";
import * as client from "openid-client";
import { getAuthMode, getOidcConfig } from "~/lib/auth";
import { SESSION_COOKIE } from "~/lib/session";

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  if (getAuthMode() === "dev") {
    return new Response("Not Found", { status: 404 });
  }

  cookies.delete(SESSION_COOKIE, { path: "/" });

  try {
    const config = await getOidcConfig();
    const meta = config.serverMetadata();
    if (meta.end_session_endpoint) {
      const postLogoutUrl = new URL("/", url);
      const endSession = client.buildEndSessionUrl(config, {
        post_logout_redirect_uri: postLogoutUrl.href,
      });
      return redirect(endSession.href, 302);
    }
  } catch {
    // Fall through to local redirect if config can't be discovered.
  }

  return redirect("/", 302);
};
