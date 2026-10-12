/**
 * Organization publishing rules (ORG-05, GOV-01/02, CASE-01):
 *  - only verified, active organizations publish (drafts are always fine);
 *  - the owner (org admin) decides which requests coordinators may publish on their own:
 *      owner_all                 – every request needs an owner's approval
 *      owner_first_and_high_risk – the organization's first request and high-risk ones (default)
 *      delegated                 – coordinators publish directly
 *  - an owner's decision records who approved, and when; a rejected draft stays private with notes.
 */
import { pool } from "../../lib/db";
import { orgMembership, type PolicyUser } from "../../lib/policy";
import { notify } from "../notifications/service";

export type OrgStanding = { verified: boolean; suspended: boolean; status: string; policy: string; name: string };

export async function orgStanding(slug: string): Promise<OrgStanding | null> {
  const r = await pool.query("SELECT name, verification_status, suspended_at, publication_policy FROM organizations WHERE slug = $1", [slug]);
  const o = r.rows[0];
  if (!o) return null;
  return { verified: o.verification_status === "approved" && !o.suspended_at, suspended: Boolean(o.suspended_at) || o.verification_status === "suspended", status: String(o.verification_status), policy: String(o.publication_policy), name: String(o.name) };
}

/** Sensitive categories, guardian consent or a background check make a request high-risk. */
export const isHighRisk = (row: Record<string, any>) => Boolean(row.is_sensitive || row.requires_guardian_consent || row.requires_background_check);

export async function needsOwnerApproval(user: PolicyUser, row: Record<string, any>, policy: string) {
  const m = orgMembership(user, String(row.requester_org_slug));
  if (m?.role === "admin") return false;
  if (policy === "delegated") return false;
  if (policy === "owner_all") return true;
  const first = await pool.query("SELECT 1 FROM service_requests WHERE requester_org_slug = $1 AND published_at IS NOT NULL AND ($2::uuid IS NULL OR id <> $2) LIMIT 1", [row.requester_org_slug, row.id ?? null]);
  return !first.rowCount || isHighRisk(row);
}

/** The message shown when an organization can't publish. */
export function standingMessage(s: OrgStanding) {
  if (s.suspended) return "Your organization is suspended, so requests can't go public. Reply to the notice from ThankYou to ask for a review.";
  if (s.status === "needs_info") return "ThankYou asked for more information before verifying your organization. Answer it in Organization settings; your drafts are saved.";
  if (s.status === "submitted") return "Your organization's verification is being reviewed. Requests can go public once it's verified; your drafts are saved.";
  return "Only verified organizations can publish requests. Submit verification in Organization settings; your drafts are saved.";
}

export async function submitForOwnerApproval(user: PolicyUser, row: Record<string, any>) {
  await pool.query("UPDATE service_requests SET owner_approval = 'pending', owner_approval_notes = NULL, submitted_by_user_id = $2, updated_at = NOW() WHERE id = $1", [row.id, user.id]);
  await pool.query(
    "INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind, reason) VALUES ($1, 'submit_for_owner_approval', $2, $2, $3, 'user', NULL)",
    [row.id, row.status, user.id]
  );
  const owners = await pool.query("SELECT user_id FROM organization_members WHERE org_slug = $1 AND status = 'active' AND role = 'admin' AND user_id IS NOT NULL", [row.requester_org_slug]);
  for (const o of owners.rows) {
    if (String(o.user_id) === user.id) continue;
    await notify(String(o.user_id), "request_updates", {
      title: `“${row.title}” is waiting for your approval`,
      body: "A coordinator wants to publish it.",
      href: `/org/requests/${row.id}`,
      email: {
        subject: `Approve “${row.title}” to publish it`,
        heading: "A request is waiting for your approval",
        lines: [`A coordinator submitted “${row.title}”. Check the duties and safety details, then approve it or send it back with a note.`],
        cta: { label: "Review the request", url: `/org/requests/${row.id}` }
      }
    });
  }
}
