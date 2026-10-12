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
  const req = await pool.query(
    `SELECT r.id, r.requester_org_slug, r.requires_guardian_consent, r.requires_background_check, r.starts_at,
            to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, p.background_check_status
       FROM service_requests r LEFT JOIN user_profiles p ON p.user_id = $2 WHERE r.id = $1`,
    [requestId, volunteerId]
  );
  const r = req.rows[0];
  if (!r) return { status: "cleared", items: [] };
  const items: PrereqItem[] = [];

  if (r.requester_org_slug) {
    const docs = await pool.query(
      `SELECT d.id, d.title, d.doc_type, d.current_version, a.required_before,
              (SELECT MAX(v.version) FROM org_document_versions v WHERE v.document_id = d.id AND v.requires_resign) AS min_version,
              (SELECT MAX(k.document_version) FROM volunteer_document_acks k WHERE k.org_document_id = d.id AND k.volunteer_user_id = $2 AND k.request_id = $3) AS signed_version
         FROM org_document_assignments a
         JOIN org_documents d ON d.id = a.org_document_id
        WHERE d.org_slug = $1 AND d.active AND d.require_ack AND (a.request_id = $3 OR a.request_id IS NULL)
        ORDER BY a.required_before, d.title`,
      [r.requester_org_slug, volunteerId, requestId]
    );
    const seen = new Set<string>();
    for (const d of docs.rows) {
      if (seen.has(String(d.id))) continue;
      seen.add(String(d.id));
      const min = Number(d.min_version || 1);
      const signed = d.signed_version == null ? null : Number(d.signed_version);
      const state: PrereqState = signed == null ? "missing" : signed >= min ? "done" : "stale";
      items.push({
        kind: "document",
        id: String(d.id),
        label: `${d.doc_type === "training" ? "Training" : "Form"}: ${d.title}`,
        required_before: d.required_before === "apply" ? "apply" : "check_in",
        state,
        detail: state === "stale" ? `Updated to version ${d.current_version} since you signed. Sign the new version.` : null,
        version: Number(d.current_version),
        signed_version: signed
      });
    }
  }

  if (r.requires_guardian_consent) {
    const on = r.starts_at && new Date(r.starts_at) > new Date() ? new Date(r.starts_at) : new Date();
    const age = ageOn(r.birth_date, on);
    if (age !== null && age < ADULT_AGE) {
      const c = await pool.query(
        "SELECT status, guardian_name, expires_at FROM guardian_consents WHERE volunteer_user_id = $1 AND request_id = $2 AND status <> 'replaced' ORDER BY requested_at DESC LIMIT 1",
        [volunteerId, requestId]
      );
      const g = c.rows[0];
      const state: PrereqState = !g ? "missing" : g.status === "granted" ? "done" : g.status === "declined" ? "declined" : new Date(g.expires_at) < new Date() ? "missing" : "requested";
      items.push({
        kind: "guardian",
        id: null,
        label: "Consent from a parent or guardian",
        required_before: "check_in",
        state,
        detail: state === "requested" ? `Waiting for ${g.guardian_name} to respond.` : state === "declined" ? `${g.guardian_name} declined.` : null
      });
    }
  }

  if (r.requires_background_check) {
    const s = String(r.background_check_status || "none");
    items.push({
      kind: "background_check",
      id: null,
      label: "Background check",
      required_before: "apply",
      state: s === "cleared" ? "done" : s === "expired" ? "expired" : "missing",
      detail: s === "pending" ? "In progress." : null
    });
  }

  const status = items.some((i) => BLOCKING.includes(i.state)) ? "blocked" : items.some((i) => i.state !== "done") ? "pending" : "cleared";
  return { status, items };
}

/** A short sentence listing what still has to happen, for 409 responses. */
export function outstanding(p: Prerequisites) {
  const left = p.items.filter((i) => i.state !== "done").map((i) => i.label.replace(/^Form: /, "").replace(/^Training: /, ""));
  return left.length ? `Before check-in: ${left.join(", ")}.` : "";
}
