/**
 * Shareable service records (REC-02/03, ID-07): a volunteer picks approved entries, previews exactly
 * what a recipient will see, and gets an expiring link. The public verification page shows the
 * record as issued (a frozen snapshot) and its current state: valid, expired, revoked, replaced, or
 * corrected after issue. Anything but "valid" shows no entry data (TEST-02).
 */
import crypto from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { wrap } from "../../lib/http";
import { requireVolunteerUser } from "../../middleware/auth";
import { METHOD_LABEL, type Method } from "../contributions/service";

const ROLE_LABEL: Record<string, string> = {
  org_admin: "Organization administrator",
  org_manager: "Organization manager",
  requester: "The person who asked for help"
};

export type RecordEntry = {
  date: string;
  activity: string;
  organization: string;
  organization_verified: boolean;
  hours: number | null;
  units: number | null;
  unit: string | null;
  approved_by: string;
  approved_at: string | null;
  verification: string;
  corrected: boolean;
};

export type Snapshot = {
  volunteer_name: string;
  name_kind: "display" | "legal";
  entries: RecordEntry[];
  totals: { hours: number; units: { unit: string; amount: number }[] };
  statement: string;
};

const STATEMENT =
  "Each entry was approved on Volunteer Services by the organization (or person) the volunteer served, using the method shown. " +
  "Volunteer Services confirmed the volunteer's email address; it did not check an identity document. " +
  "Approval by an organization is not acceptance by a school or employer.";

function localDate(d: Date, tz: string | null) {
  try {
    return d.toLocaleDateString("en-CA", { timeZone: tz || "America/New_York" });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function recordState(r: { revoked_at: unknown; replaced_by_id: unknown; superseded_at: unknown; expires_at: unknown }) {
  if (r.revoked_at) return "revoked" as const;
  if (r.replaced_by_id) return "replaced" as const;
  if (r.superseded_at) return "corrected" as const;
  if (new Date(String(r.expires_at)) < new Date()) return "expired" as const;
  return "valid" as const;
}

async function buildSnapshot(volunteerId: string, ids: string[], nameMode: "display" | "legal"): Promise<{ snapshot: Snapshot; ids: string[] } | { error: string }> {
  const r = await pool.query(
    `SELECT c.id, COALESCE(c.started_at, c.decided_at, c.created_at) AS date, r.title, o.name AS org_name, o.verification_status,
            c.approved_hours::float AS hours, c.approved_units::float AS units, c.unit, c.decided_by_role, c.decided_at, c.verification_method, COALESCE(c.timezone, r.timezone) AS tz,
            EXISTS (SELECT 1 FROM contribution_decisions d WHERE d.contribution_id = c.id AND d.action = 'corrected') AS corrected
       FROM contributions c
       JOIN service_requests r ON r.id = c.request_id
       LEFT JOIN organizations o ON o.slug = c.org_slug
      WHERE c.id = ANY($1::uuid[]) AND c.volunteer_user_id = $2 AND c.status IN ('approved', 'adjusted')
      ORDER BY 2`,
    [ids, volunteerId]
  );
  if (r.rowCount !== ids.length) return { error: "Only your approved hours can go on a record. Remove anything waiting, self-reported or not approved." };
  const p = (await pool.query("SELECT full_name, display_name FROM user_profiles WHERE user_id = $1", [volunteerId])).rows[0] ?? {};
  const name = nameMode === "legal" ? String(p.full_name || "").trim() : String(p.display_name || p.full_name || "").trim();
  if (!name) return { error: nameMode === "legal" ? "Add your full name in your profile first." : "Add a display name in your profile first." };
  const entries: RecordEntry[] = r.rows.map((x) => ({
    // The local date where the work happened, not the UTC one (an evening shift stays on its day).
    date: localDate(new Date(x.date), x.tz),
    activity: String(x.title),
    organization: x.org_name ? String(x.org_name) : "An individual in the community",
    organization_verified: x.verification_status === "approved",
    hours: x.hours,
    units: x.units,
    unit: x.unit ?? null,
    approved_by: ROLE_LABEL[String(x.decided_by_role)] ?? "Reviewer",
    approved_at: x.decided_at ? new Date(x.decided_at).toISOString() : null,
    verification: x.verification_method === "volunteer_report" ? "Reported by the volunteer and approved by the reviewer" : METHOD_LABEL[x.verification_method as Method],
    corrected: Boolean(x.corrected)
  }));
  const units = new Map<string, number>();
  for (const e of entries) if (e.unit && e.units) units.set(e.unit, (units.get(e.unit) ?? 0) + e.units);
  return {
    ids: r.rows.map((x) => String(x.id)),
    snapshot: {
      volunteer_name: name,
      name_kind: nameMode,
      entries,
      totals: { hours: Math.round(entries.reduce((n, e) => n + (e.hours ?? 0), 0) * 100) / 100, units: [...units].map(([unit, amount]) => ({ unit, amount })) },
      statement: STATEMENT
    }
  };
}

const Body = z.object({
  contributionIds: z.array(z.string().uuid()).min(1).max(200),
  nameMode: z.enum(["display", "legal"]).default("display"),
  expiresInDays: z.coerce.number().int().refine((n) => [7, 30, 90, 365].includes(n), "Pick 7, 30, 90 or 365 days").default(90)
});

const link = (token: string) => `${env.WEB_BASE_URL.replace(/\/$/, "")}/verify/${token}`;

export function registerRecordRoutes(app: Express) {
  app.get(
    "/v1/volunteer/records",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const r = await pool.query(
        `SELECT id, token, name_mode, issued_at, expires_at, revoked_at, replaced_by_id, superseded_at, view_count, last_viewed_at,
                cardinality(contribution_ids) AS entry_count, (snapshot->'totals'->>'hours')::float AS hours
           FROM service_records WHERE volunteer_user_id = $1 ORDER BY issued_at DESC`,
        [user.id]
      );
      return res.json({ records: r.rows.map((x) => ({ ...x, state: recordState(x), url: link(x.token) })) });
    })
  );

  // Exactly what a recipient will see, before anything is shared (REC-02: explicit preview).
  app.post(
    "/v1/volunteer/records/preview",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const body = Body.safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Pick at least one approved entry", errors: body.error.flatten() });
      const built = await buildSnapshot(user.id, [...new Set(body.data.contributionIds)], body.data.nameMode);
      if ("error" in built) return res.status(422).json({ message: built.error });
      return res.json({ snapshot: built.snapshot, expires_at: new Date(Date.now() + body.data.expiresInDays * 86_400_000).toISOString() });
    })
  );

  app.post(
    "/v1/volunteer/records",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const body = Body.extend({ confirmed: z.literal(true) }).safeParse(req.body ?? {});
      if (!body.success) return res.status(400).json({ message: "Preview the record and confirm what will be shared" });
      const built = await buildSnapshot(user.id, [...new Set(body.data.contributionIds)], body.data.nameMode);
      if ("error" in built) return res.status(422).json({ message: built.error });
      const token = crypto.randomBytes(24).toString("base64url");
      const r = await pool.query(
        `INSERT INTO service_records (volunteer_user_id, token, name_mode, contribution_ids, snapshot, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6::int * INTERVAL '1 day')) RETURNING id, issued_at, expires_at`,
        [user.id, token, body.data.nameMode, built.ids, JSON.stringify(built.snapshot), body.data.expiresInDays]
      );
      return res.status(201).json({ ...r.rows[0], token, url: link(token), state: "valid" });
    })
  );

  app.post(
    "/v1/volunteer/records/:id/revoke",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const r = await pool.query("UPDATE service_records SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1 AND volunteer_user_id = $2 RETURNING id, revoked_at", [id.data, user.id]);
      if (!r.rowCount) return res.status(404).json({ message: "Record not found" });
      return res.json({ ...r.rows[0], state: "revoked" });
    })
  );

  // A fresh record with today's approved values (after a correction); the old link says it was replaced.
  app.post(
    "/v1/volunteer/records/:id/reissue",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const old = (await pool.query("SELECT * FROM service_records WHERE id = $1 AND volunteer_user_id = $2", [id.data, user.id])).rows[0];
      if (!old) return res.status(404).json({ message: "Record not found" });
      if (old.revoked_at || old.replaced_by_id) return res.status(409).json({ message: "This record was already revoked or replaced" });
      const still = await pool.query("SELECT id FROM contributions WHERE id = ANY($1::uuid[]) AND status IN ('approved', 'adjusted')", [old.contribution_ids]);
      if (!still.rowCount) return res.status(422).json({ message: "None of these entries are approved any more" });
      const built = await buildSnapshot(user.id, still.rows.map((x) => String(x.id)), old.name_mode);
      if ("error" in built) return res.status(422).json({ message: built.error });
      const token = crypto.randomBytes(24).toString("base64url");
      const days = Math.max(1, Math.ceil((new Date(old.expires_at).getTime() - new Date(old.issued_at).getTime()) / 86_400_000));
      const r = await pool.query(
        `INSERT INTO service_records (volunteer_user_id, token, name_mode, contribution_ids, snapshot, expires_at)
         VALUES ($1, $2, $3, $4, $5, NOW() + ($6::int * INTERVAL '1 day')) RETURNING id, issued_at, expires_at`,
        [user.id, token, old.name_mode, built.ids, JSON.stringify(built.snapshot), days]
      );
      await pool.query("UPDATE service_records SET replaced_by_id = $2 WHERE id = $1", [old.id, r.rows[0].id]);
      return res.status(201).json({ ...r.rows[0], token, url: link(token), state: "valid" });
    })
  );

  // Public verification: no account, no private data unless the record is currently valid.
  app.get(
    "/v1/public/records/:token",
    wrap(async (req, res) => {
      const token = String(req.params.token || "");
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-robots-tag", "noindex");
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ state: "not_found" });
      const r = await pool.query(
        "UPDATE service_records SET view_count = view_count + 1, last_viewed_at = NOW() WHERE token = $1 RETURNING issued_at, expires_at, revoked_at, replaced_by_id, superseded_at, snapshot",
        [token]
      );
      const row = r.rows[0];
      if (!row) return res.status(404).json({ state: "not_found" });
      const state = recordState(row);
      const base = { state, issuer: "Volunteer Services", issued_at: row.issued_at, expires_at: row.expires_at, revoked_at: row.revoked_at };
      if (state !== "valid") return res.json(base);
      return res.json({ ...base, ...(row.snapshot as Snapshot) });
    })
  );
}
