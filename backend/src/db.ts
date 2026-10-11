import { Pool } from "pg";

export function createPool(connectionString?: string) {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  return new Pool({ connectionString: url });
}
