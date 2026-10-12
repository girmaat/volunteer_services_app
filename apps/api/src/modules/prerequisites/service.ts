/**
 * Prerequisites for one volunteer on one request (FORM-01/04, CASE-02): signed forms (current
 * version), guardian consent for minors where the request asks for it, and a background check.
 *
 *   cleared  – everything is done
 *   pending  – something hasn't been done yet
 *   blocked  – something was done but no longer counts (a form changed, consent was declined,
 *              a check expired) and must be redone before check-in
 *
 * Forms can be required before applying or before check-in; check-in needs everything.
 */
import { pool } from "../../lib/db";
import { ADULT_AGE, ageOn } from "../../lib/age";

export type PrereqState = "done" | "missing" | "stale" | "declined" | "expired" | "requested";
export type PrereqItem = {
  kind: "document" | "guardian" | "background_check";
  id: string | null;
  label: string;
  required_before: "apply" | "check_in";
  state: PrereqState;
  detail: string | null;
  version?: number;
  signed_version?: number | null;
};
export type Prerequisites = { status: "cleared" | "pending" | "blocked"; items: PrereqItem[] };

const BLOCKING: PrereqState[] = ["stale", "declined", "expired"];

export async function prerequisites(volunteerId: string, requestId: string): Promise<Prerequisites> {
  return (await prerequisitesForRequest(requestId, [volunteerId])).get(volunteerId) ?? { status: "cleared", items: [] };
}

/**
 * Prerequisites for many volunteers on one request in a fixed number of queries (the applicants
 * list asks for everyone who's in at once).
 */
export async function prerequisitesForRequest(requestId: string, volunteerIds: string[]): Promise<Map<string, Prerequisites>> {
  const out = new Map<string, Prerequisites>();
  const ids = [...new Set(volunteerIds)];
  if (!ids.length) return out;
  const r = (
    await pool.query("SELECT id, requester_org_slug, requires_guardian_consent, requires_background_check, starts_at FROM service_requests WHERE id = $1", [requestId])
  ).rows[0];
  if (!r) {
    for (const v of ids) out.set(v, { status: "cleared", items: [] });
    return out;
  }
  const profiles = new Map<string, { birth_date: string | null; background_check_status: string | null }>(
    (
      await pool.query("SELECT user_id, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, background_check_status FROM user_profiles WHERE user_id = ANY($1::uuid[])", [ids])
    ).rows.map((p) => [String(p.user_id), p])
  );

  type Doc = { id: string; title: string; doc_type: string; current_version: number; required_before: string; min_version: number | null };
  let docs: Doc[] = [];
  const signed = new Map<string, number>(); // `${doc}:${volunteer}` -> highest signed version
  if (r.requester_org_slug) {
    const d = await pool.query(
      `SELECT DISTINCT ON (d.id) d.id, d.title, d.doc_type, d.current_version, a.required_before,
              (SELECT MAX(v.version) FROM org_document_versions v WHERE v.document_id = d.id AND v.requires_resign) AS min_version
         FROM org_document_assignments a
         JOIN org_documents d ON d.id = a.org_document_id
        WHERE d.org_slug = $1 AND d.active AND d.require_ack AND (a.request_id = $2 OR a.request_id IS NULL)
        ORDER BY d.id, a.required_before`,
      [r.requester_org_slug, requestId]
    );
    docs = d.rows.sort((a, b) => String(a.required_before).localeCompare(String(b.required_before)) || String(a.title).localeCompare(String(b.title)));
    if (docs.length) {
      const k = await pool.query(
        `SELECT org_document_id, volunteer_user_id, MAX(document_version) AS v FROM volunteer_document_acks
          WHERE request_id = $1 AND volunteer_user_id = ANY($2::uuid[]) AND org_document_id = ANY($3::uuid[])
          GROUP BY org_document_id, volunteer_user_id`,
        [requestId, ids, docs.map((x) => x.id)]
      );
      for (const row of k.rows) signed.set(`${row.org_document_id}:${row.volunteer_user_id}`, Number(row.v));
    }
  }

  const consents = new Map<string, { status: string; guardian_name: string; expires_at: string }>();
  if (r.requires_guardian_consent) {
    const c = await pool.query(
      `SELECT DISTINCT ON (volunteer_user_id) volunteer_user_id, status, guardian_name, expires_at FROM guardian_consents
        WHERE request_id = $1 AND volunteer_user_id = ANY($2::uuid[]) AND status <> 'replaced'
        ORDER BY volunteer_user_id, requested_at DESC`,
      [requestId, ids]
    );
    for (const row of c.rows) consents.set(String(row.volunteer_user_id), row);
  }

  const on = r.starts_at && new Date(r.starts_at) > new Date() ? new Date(r.starts_at) : new Date();
  for (const v of ids) {
    const p = profiles.get(v) ?? { birth_date: null, background_check_status: null };
    const items: PrereqItem[] = [];
    for (const d of docs) {
      const min = Number(d.min_version || 1);
      const got = signed.has(`${d.id}:${v}`) ? signed.get(`${d.id}:${v}`)! : null;
      const state: PrereqState = got == null ? "missing" : got >= min ? "done" : "stale";
      items.push({
        kind: "document",
        id: String(d.id),
        label: `${d.doc_type === "training" ? "Training" : "Form"}: ${d.title}`,
        required_before: d.required_before === "apply" ? "apply" : "check_in",
        state,
        detail: state === "stale" ? `Updated to version ${d.current_version} since you signed. Sign the new version.` : null,
        version: Number(d.current_version),
        signed_version: got
      });
    }
    if (r.requires_guardian_consent) {
      const age = ageOn(p.birth_date, on);
      if (age !== null && age < ADULT_AGE) {
        const g = consents.get(v);
        const state: PrereqState = !g ? "missing" : g.status === "granted" ? "done" : g.status === "declined" ? "declined" : new Date(g.expires_at) < new Date() ? "missing" : "requested";
        items.push({
          kind: "guardian",
          id: null,
          label: "Consent from a parent or guardian",
          required_before: "check_in",
          state,
          detail: state === "requested" ? `Waiting for ${g!.guardian_name} to respond.` : state === "declined" ? `${g!.guardian_name} declined.` : null
        });
      }
    }
    if (r.requires_background_check) {
      const st = String(p.background_check_status || "none");
      items.push({
        kind: "background_check",
        id: null,
        label: "Background check",
        required_before: "apply",
        state: st === "cleared" ? "done" : st === "expired" ? "expired" : "missing",
        detail: st === "pending" ? "In progress." : null
      });
    }
    const status = items.some((i) => BLOCKING.includes(i.state)) ? "blocked" : items.some((i) => i.state !== "done") ? "pending" : "cleared";
    out.set(v, { status, items });
  }
  return out;
}

/** A short sentence listing what still has to happen, for 409 responses. */
export function outstanding(p: Prerequisites) {
  const left = p.items.filter((i) => i.state !== "done").map((i) => i.label.replace(/^Form: /, "").replace(/^Training: /, ""));
  return left.length ? `Before check-in: ${left.join(", ")}.` : "";
}
