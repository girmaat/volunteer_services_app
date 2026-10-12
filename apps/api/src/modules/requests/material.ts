/**
 * Material edits (DATA-01, REQ-08): when a live request changes in a way that matters to someone
 * already coming (what, where, how, requirements), the change is logged, accepted volunteers are told
 * what changed, and they confirm again. Time changes are handled by the calendar update.
 */
import { pool } from "../../lib/db";
import { notify } from "../notifications/service";

const MATERIAL: [string, string][] = [
  ["title", "title"],
  ["description", "details"],
  ["mode", "in person or remote"],
  ["public_area", "area"],
  ["exact_address", "address"],
  ["accessibility_notes", "accessibility"],
  ["equipment_notes", "what to bring"],
  ["min_age", "minimum age"],
  ["requires_car", "car needed"],
  ["requires_background_check", "background check"],
  ["requires_training", "training"],
  ["requires_waiver", "waiver"],
  ["requires_guardian_consent", "guardian consent"]
];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Compares the saved request with `before`; returns the labels of what changed (empty when nothing material did). */
export async function materialEdit(before: Record<string, any>, actorUserId: string, timeAlreadyAnnounced: boolean): Promise<string[]> {
  const after = (await pool.query(`SELECT id, status, ${MATERIAL.map(([k]) => k).join(", ")} FROM service_requests WHERE id = $1`, [before.id])).rows[0];
  if (!after) return [];
  const changed = MATERIAL.filter(([k]) => !same(before[k], after[k])).map(([, label]) => label);
  if (!changed.length) return [];
  await pool.query(
    "INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind, reason) VALUES ($1, 'material_edit', $2, $2, $3, 'user', $4)",
    [after.id, after.status, actorUserId, `Changed: ${changed.join(", ")}`]
  );
  const people = await pool.query(
    "SELECT id, volunteer_user_id FROM request_applications WHERE request_id = $1 AND status IN ('accepted', 'confirmed')",
    [after.id]
  );
  if (!people.rowCount) return changed;
  await pool.query("UPDATE request_commitments SET volunteer_confirmed_at = NULL, updated_at = NOW() WHERE request_id = $1 AND status IN ('scheduled', 'confirmed')", [after.id]);
  const list = changed.join(", ");
  for (const p of people.rows) {
    const href = `/volunteer/applications/${p.id}`;
    const title = `“${after.title}” changed`;
    await notify(String(p.volunteer_user_id), "application_status", {
      title,
      body: `Updated: ${list}. Check the details and confirm you're still coming.`,
      href,
      data: { requestId: String(after.id), changed },
      email: {
        subject: title,
        heading: title,
        lines: [`The organizer updated: ${list}.`, `${timeAlreadyAnnounced ? "Together with the new time, please" : "Please"} check the details and confirm you're still coming.`],
        cta: { label: "Review and confirm", url: href },
        dedupeKey: `material:${p.id}:${Date.now()}`
      }
    });
  }
  return changed;
}
