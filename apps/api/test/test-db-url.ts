import fs from "fs";
import path from "path";
import { parse } from "dotenv";

/**
 * The test database URL: TEST_DATABASE_URL, or the DATABASE_URL from apps/api/.env with the
 * database name replaced by "thankyou_test" (same server and credentials, separate database).
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  let base = "";
  const envFile = path.resolve(__dirname, "../.env");
  if (fs.existsSync(envFile)) {
    const vars = parse(fs.readFileSync(envFile));
    base = vars.DATABASE_URL_MIGRATIONS || vars.DATABASE_URL || "";
  }
  if (!base) return "postgres://postgres@localhost:5433/thankyou_test";
  const u = new URL(base);
  u.pathname = "/thankyou_test";
  return u.toString();
}
