/**
 * Performance check for the Phase 1 budget: Recommended and Discovery answer in < 300 ms
 * with 1,000 open requests in the database.
 *
 *   pnpm --filter @thankyou/api perf:check            # add 1,000 copies, time the endpoints, remove them
 *   pnpm --filter @thankyou/api perf:check -- --keep  # leave the copies in place afterwards
 *
 * Needs the API running (API_URL, default http://localhost:4202) and the dev seed
 * (it signs in as volunteer.local@thankyou.test). Never run against production.
 */
import "dotenv/config";
import { Pool } from "pg";

const API = process.env.API_URL || "http://localhost:4202";
const N = Number(process.env.PERF_ROWS || 1000);
const BUDGET_MS = 300;
const MARK = " [perf]";
const keep = process.argv.includes("--keep");

const COPY = [
  "requester_user_id", "description", "status", "location_text", "mode", "needed_by", "tags", "requester_org_slug", "category",
  "required_skills", "nice_to_have_skills", "schedule_type", "starts_at", "ends_at", "recurrence_rule", "timezone", "duration_minutes",
  "volunteers_needed", "min_age", "requires_background_check", "requires_training", "requires_waiver", "requires_car", "equipment_notes",
  "urgency", "apply_by", "accessibility_notes", "is_sensitive", "review_status", "public_area", "exact_address", "published_at"
];

async function time(path: string, token: string, runs = 9) {
  const out: number[] = [];
  let status = 0;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const r = await fetch(API + path, { headers: { authorization: `Bearer ${token}` } });
    await r.arrayBuffer();
    status = r.status;
    out.push(performance.now() - t);
  }
  out.sort((a, b) => a - b);
  return { status, median: out[Math.floor(out.length / 2)], p90: out[Math.floor(out.length * 0.9)] };
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("perf:check refuses to run with NODE_ENV=production");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(`DELETE FROM service_requests WHERE title LIKE '%${MARK}'`);
    await pool.query(
      `INSERT INTO service_requests (title, location_lat, location_lng, created_at, updated_at, ${COPY.join(", ")})
       SELECT s.title || ' ' || g || '${MARK}', s.location_lat + (random() - 0.5) * 0.6, s.location_lng + (random() - 0.5) * 0.6,
              NOW() - (g || ' minutes')::interval, NOW(), ${COPY.map((c) => `s.${c}`).join(", ")}
         FROM generate_series(1, $1::int) g
         CROSS JOIN LATERAL (SELECT * FROM service_requests
                              WHERE status = 'open' AND NOT is_sensitive AND review_status IS DISTINCT FROM 'pending_review'
                                AND title NOT LIKE '%${MARK}'
                              ORDER BY id OFFSET (g % 10) LIMIT 1) s`,
      [N]
    );
    await pool.query("ANALYZE service_requests");
    const total = (await pool.query("SELECT COUNT(*)::int AS n FROM service_requests")).rows[0].n;

    const login = await fetch(`${API}/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "volunteer.local@thankyou.test", password: process.env.SEED_PASSWORD || "Password!" })
    });
    const token = ((await login.json()) as { sessionToken?: string }).sessionToken;
    if (!token) throw new Error(`Sign-in failed (${login.status}). Is the API running and the dev seed loaded?`);

    console.log(`${total} requests in the database. Budget ${BUDGET_MS} ms.\n`);
    let failed = false;
    for (const path of ["/v1/volunteer/opportunities/recommended", "/v1/volunteer/dashboard", "/v1/discovery/opportunities", "/v1/discovery/opportunities?q=food&radius=25"]) {
      const r = await time(path, token);
      const ok = r.status === 200 && r.p90 < BUDGET_MS;
      failed ||= !ok;
      console.log(`${ok ? "PASS" : "FAIL"}  ${path.padEnd(48)} ${r.status}  median ${r.median.toFixed(0)} ms  p90 ${r.p90.toFixed(0)} ms`);
    }
    if (failed) process.exitCode = 1;
  } finally {
    if (!keep) await pool.query(`DELETE FROM service_requests WHERE title LIKE '%${MARK}'`);
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
