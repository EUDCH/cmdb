import * as client from "openid-client";
import type { Session } from "./session";

export type AuthMode = "oidc" | "dev";

export function getAuthMode(): AuthMode {
  const raw = (import.meta.env.AUTH_MODE ?? "oidc").trim().toLowerCase();
  return raw === "dev" ? "dev" : "oidc";
}

export const DEV_SESSION: Session = {
  sub: "dev",
  email: "dev@local",
  name: "Dev",
  groups: [],
  expiresAt: Number.MAX_SAFE_INTEGER,
};

let configPromise: Promise<client.Configuration> | null = null;

export function getOidcConfig(): Promise<client.Configuration> {
  if (configPromise) return configPromise;

  const issuer = import.meta.env.OIDC_ISSUER_URL;
  const clientId = import.meta.env.OIDC_CLIENT_ID;
  const clientSecret = import.meta.env.OIDC_CLIENT_SECRET;
  if (!issuer || !clientId || !clientSecret) {
    throw new Error(
      "OIDC_ISSUER_URL, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET must be set when AUTH_MODE=oidc",
    );
  }

  configPromise = client.discovery(new URL(issuer), clientId, clientSecret);
  return configPromise;
}

export function getRedirectUri(): string {
  const explicit = import.meta.env.OIDC_REDIRECT_URI;
  if (!explicit) {
    throw new Error("OIDC_REDIRECT_URI must be set when AUTH_MODE=oidc");
  }
  return explicit;
}
