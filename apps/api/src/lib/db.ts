import { Pool } from "pg";
import { env } from "./env";


export function createPool(connectionString?: string, max = env.DATABASE_POOL_MAX) {
  const url = connectionString || env.DATABASE_URL;
  return new Pool({ connectionString: url, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

/** Shared application pool (least-privilege runtime role). */
export const pool = createPool(env.DATABASE_URL);

/** Pool for schema checks / migrations (schema-owner role when configured). */
export const migrationPool = env.DATABASE_URL_MIGRATIONS ? createPool(env.DATABASE_URL_MIGRATIONS, 2) : pool;
