// Runs before every test file (and before the app modules are imported).
import { testDatabaseUrl } from "./test-db-url";

const url = testDatabaseUrl();
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = url;
process.env.DATABASE_URL_MIGRATIONS = url;
process.env.JOBS_DISABLED = "true";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.GEOCODING_DISABLED = "true";
process.env.EMAIL_TRANSPORT = "disabled";
process.env.DEV_EMAIL_LINKS = "true";
process.env.WEB_BASE_URL = "http://localhost:3202";
process.env.LOG_LEVEL = "silent";
process.env.SEED_PASSWORD = "Test-Password-123!";
