/**
 * Saved searches with alerts (VOL-03). A volunteer saves a discovery search; once a day (or a week)
 * the hourly job looks for requests that went live since the last check and sends one notification
 * listing them. Alerts follow the "alerts" notification preference, so email can be turned off there
 * or from the unsubscribe link.
 */
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { logger } from "../../lib/logger";
import type { PolicyUser } from "../../lib/policy";
import { requireVolunteerUser } from "../../middleware/auth";
import { onHourly } from "../../jobs/maintenance";
import { DiscoveryQuery, filtersFrom } from "../discovery/filters";
import { discover, loadViewer } from "../discovery/query";
import { notify } from "../notifications/service";

const MAX_SAVED = 20;

/** Keeps only the filters discovery understands, in a stable order (no cursor or limit). */
function cleanQuery(raw: string): string | null {
  const params = new URLSearchParams(raw.replace(/^\?/, ""));
  const obj: Record<string, string> = {};
  for (const k of ["q", "category", "skills", "mode", "radius", "verified_org", "urgency", "tab", "org"]) {
    const v = params.get(k);
    if (v) obj[k] = v;
  }
  const ok = DiscoveryQuery.safeParse(obj);
  if (!ok.success) return null;
  return new URLSearchParams(obj).toString();
}

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().max(1000),
  alerts: z.boolean().default(true),
  frequency: z.enum(["daily", "weekly"]).default("daily")
});

const COLUMNS = "id, name, query, alerts, frequency, last_checked_at, last_notified_at, created_at";

export function registerAlertRoutes(app: Express) {
  app.get(
    "/v1/volunteer/saved-searches",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const r = await pool.query(`SELECT ${COLUMNS} FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC`, [user.id]);
      return res.json({ saved_searches: r.rows });
    })
  );

  app.post(
    "/v1/volunteer/saved-searches",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const b = Body.safeParse(req.body ?? {});
      if (!b.success) return res.status(400).json({ message: "Give the search a name", errors: b.error.flatten() });
      const query = cleanQuery(b.data.query);
      if (query == null) return res.status(400).json({ message: "That search can't be saved" });
      const n = (await pool.query("SELECT COUNT(*)::int AS n FROM saved_searches WHERE user_id = $1", [user.id])).rows[0].n;
      if (n >= MAX_SAVED) return res.status(409).json({ message: `You can keep up to ${MAX_SAVED} saved searches. Delete one first.` });
      const dupe = await pool.query("SELECT id FROM saved_searches WHERE user_id = $1 AND query = $2", [user.id, query]);
      if (dupe.rowCount) return res.status(409).json({ message: "You already saved this search", id: dupe.rows[0].id });
      const r = await pool.query(
        `INSERT INTO saved_searches (user_id, name, query, alerts, frequency) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
        [user.id, b.data.name, query, b.data.alerts, b.data.frequency]
      );
      return res.status(201).json(r.rows[0]);
    })
  );

  app.patch(
    "/v1/volunteer/saved-searches/:id",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      const b = Body.partial().omit({ query: true }).safeParse(req.body ?? {});
      if (!id.success || !b.success) return res.status(400).json({ message: "Invalid request" });
      const r = await pool.query(
        `UPDATE saved_searches SET name = COALESCE($3, name), alerts = COALESCE($4, alerts), frequency = COALESCE($5, frequency),
                last_checked_at = CASE WHEN $4 AND NOT alerts THEN NOW() ELSE last_checked_at END, updated_at = NOW()
          WHERE id = $1 AND user_id = $2 RETURNING ${COLUMNS}`,
        [id.data, user.id, b.data.name ?? null, b.data.alerts ?? null, b.data.frequency ?? null]
      );
      if (!r.rowCount) return res.status(404).json({ message: "Saved search not found" });
      return res.json(r.rows[0]);
    })
  );

  app.delete(
    "/v1/volunteer/saved-searches/:id",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const r = await pool.query("DELETE FROM saved_searches WHERE id = $1 AND user_id = $2", [id.data, user.id]);
      if (!r.rowCount) return res.status(404).json({ message: "Saved search not found" });
      return res.json({ deleted: true });
    })
  );
}

/** Sends alerts for saved searches that are due. Returns how many notifications went out. */
export async function runSavedSearchAlerts(now = new Date()) {
  const due = await pool.query(
    `SELECT s.id, s.user_id, s.name, s.query, s.frequency, s.last_checked_at
       FROM saved_searches s JOIN users u ON u.id = s.user_id
      WHERE s.alerts AND u.deleted_at IS NULL
        AND s.last_checked_at <= $1::timestamptz - (CASE s.frequency WHEN 'weekly' THEN 7 ELSE 1 END || ' days')::interval
      ORDER BY s.last_checked_at LIMIT 500`,
    [now.toISOString()]
  );
  let sent = 0;
  for (const s of due.rows) {
    try {
      const parsed = DiscoveryQuery.safeParse(Object.fromEntries(new URLSearchParams(String(s.query))));
      const viewer = await loadViewer({ id: String(s.user_id), roles: ["volunteer"] } as unknown as PolicyUser);
      const found = parsed.success
        ? await discover(viewer, { ...filtersFrom({ ...parsed.data, limit: 10 }), publishedAfter: new Date(s.last_checked_at).toISOString() })
        : { items: [] as { id: string; title: string }[] };
      if (found.items.length) {
        const titles = found.items.slice(0, 5).map((i: { title: string }) => `• ${i.title}`);
        const more = found.items.length > 5 ? [`…and ${found.items.length - 5} more`] : [];
        const href = `/volunteer/opportunities/recommended?${String(s.query)}`;
        const title = `${found.items.length === 10 ? "10+" : found.items.length} new for “${s.name}”`;
        await notify(String(s.user_id), "alerts", {
          title,
          body: found.items.slice(0, 3).map((i: { title: string }) => i.title).join(" · "),
          href,
          data: { savedSearchId: String(s.id), requestIds: found.items.map((i: { id: string }) => i.id) },
          email: { subject: title, heading: title, lines: [...titles, ...more], cta: { label: "See them", url: href }, dedupeKey: `alert:${s.id}:${now.toISOString().slice(0, 13)}` }
        });
        sent++;
      }
      await pool.query(
        "UPDATE saved_searches SET last_checked_at = $2, last_notified_at = CASE WHEN $3 THEN $2 ELSE last_notified_at END WHERE id = $1",
        [s.id, now.toISOString(), found.items.length > 0]
      );
    } catch (e) {
      logger.warn({ err: e, savedSearchId: s.id }, "saved search alert failed");
    }
  }
  return sent;
}

onHourly(runSavedSearchAlerts);
