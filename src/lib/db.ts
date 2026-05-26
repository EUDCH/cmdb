import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

// `import.meta.env.X` is resolved at build time by Vite and inlined as the
// literal string (or `undefined` when the var is unset in the build env).
// Production builds run with no runtime secrets present, so we'd ship a
// bundle where `url` is the literal `undefined`. Read `process.env` instead
// so the value is looked up when the request lands.
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const client = postgres(url, {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
