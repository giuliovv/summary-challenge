import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

declare global {
  var dbPool: Pool | undefined;
}

type NeonDatabase = ReturnType<typeof drizzleNeon<typeof schema>>;
type PgDatabase = ReturnType<typeof drizzlePg<typeof schema>>;
type Database = NeonDatabase | PgDatabase;

let dbInstance: Database | null = null;

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (isServerlessRuntime()) {
    dbInstance = drizzleNeon(neon(databaseUrl), { schema });
    return dbInstance;
  }

  const pool = globalThis.dbPool ?? new Pool({ connectionString: databaseUrl });

  if (process.env.NODE_ENV !== "production") {
    globalThis.dbPool = pool;
  }

  dbInstance = drizzlePg(pool, { schema });
  return dbInstance;
}

function isServerlessRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}
