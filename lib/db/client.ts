import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

declare global {
  var dbClient: postgres.Sql | undefined;
}

type Database = ReturnType<typeof drizzle<typeof schema>>;

let dbInstance: Database | null = null;

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  if (dbInstance) {
    return dbInstance;
  }

  const client =
    globalThis.dbClient ??
    postgres(databaseUrl, {
      max: 1,
      prepare: false,
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.dbClient = client;
  }

  dbInstance = drizzle(client, { schema });
  return dbInstance;
}
