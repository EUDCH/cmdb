import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@db/schema";

const url = import.meta.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const client = postgres(url, {
  max: 10,
  idle_timeout: 30,
});

export const db = drizzle(client, { schema });
export type DB = typeof db;
