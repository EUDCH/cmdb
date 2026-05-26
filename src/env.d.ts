/// <reference types="astro/client" />

import type { Session } from "./lib/session";

declare global {
  // Runtime config is read via `process.env.X`, never `import.meta.env.X`.
  // Vite inlines `import.meta.env.NON_PUBLIC` as literal strings at build
  // time, so production bundles ship with `undefined` baked in and every
  // request throws. `process.env` is read at request time. See lib/db.ts.
  namespace NodeJS {
    // Inventory of runtime env vars the app reads — not value-narrowed
    // ("oidc" | "dev" lives in the resolver, not the type), because
    // process.env can hold any string an operator typed into .env. The
    // resolver in lib/auth.ts allowlists known values; everything else
    // falls back to the safe default.
    interface ProcessEnv {
      DATABASE_URL?: string;
      AUTH_MODE?: string;
      OIDC_ISSUER_URL?: string;
      OIDC_CLIENT_ID?: string;
      OIDC_CLIENT_SECRET?: string;
      OIDC_REDIRECT_URI?: string;
      SESSION_SECRET?: string;
      BUILD_SHA?: string;
    }
  }

  namespace App {
    interface Locals {
      session?: Session;
    }
  }
}
