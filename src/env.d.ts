/// <reference types="astro/client" />

import type { Session } from "./lib/session";

interface ImportMetaEnv {
  readonly DATABASE_URL: string;
  readonly AUTH_MODE?: "oidc" | "dev";
  readonly OIDC_ISSUER_URL?: string;
  readonly OIDC_CLIENT_ID?: string;
  readonly OIDC_CLIENT_SECRET?: string;
  readonly OIDC_REDIRECT_URI?: string;
  readonly SESSION_SECRET: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  namespace App {
    interface Locals {
      session?: Session;
    }
  }
}
