import { pool } from "../../lib/db";
import { afterApplicationUpdate, checkAccept } from "../requests/applications";

// Requester area: service requests (Step 4.4 + Step 4.5)

export type RequesterRequestRow = {
  id: string;
  title: string;
  summary: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string | null;
  needed_by: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type RequesterRequestDetail = {
  id: string;
  requester_user_id: string;
  title: string;
  description: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string;
  needed_by: string | null;
  tags: string[] | null;
  requester_org_slug: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeTags(input: unknown): string[] {
  const raw = String(input || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 25);
}

export function parseOptionalDate(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Requester area: request applications list + decisions (Step 4.7)

export type RequesterApplicationRow = {
  id: string;
  request_id: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn" | "confirmed" | "completed" | string;
  message: string | null;
  created_at: string;
  updated_at: string;

  volunteer_user_id: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
  volunteer_bio: string | null;

  volunteer_verification_status: string | null;
};

export async function updateApplicationDecision(
  requesterUserId: string,
  applicationId: string,
  nextStatus: "accepted" | "rejected"
) {
  const existing = await pool.query(
    `
    SELECT a.id, a.status
    FROM request_applications a
    JOIN service_requests r ON r.id = a.request_id
    WHERE a.id = $1 AND r.requester_user_id = $2
    `,
    [applicationId, requesterUserId]
  );

  if (existing.rowCount === 0) {
    return { kind: "not_found" as const };
  }

  const currentStatus = String(existing.rows[0]?.status || "");
  if (currentStatus === nextStatus) {
    return { kind: "ok" as const, status: nextStatus };
  }

  if (currentStatus !== "pending" && currentStatus !== "waitlisted") {
    return { kind: "conflict" as const, status: currentStatus };
  }
  let acceptedAmount: number | null = null;
  if (nextStatus === "accepted") {
    const check = await checkAccept(applicationId);
    if (!check.ok) return { kind: "refused" as const, status: currentStatus, check };
    acceptedAmount = check.acceptedAmount;
  }

  const updated = await pool.query(
    "UPDATE request_applications SET status = $2, status_updated_at = NOW(), status_updated_by_user_id = $3, accepted_amount = COALESCE($4, accepted_amount), updated_at = NOW() WHERE id = $1 RETURNING id, status, updated_at",
    [applicationId, nextStatus, requesterUserId, acceptedAmount]
  );
  await afterApplicationUpdate(applicationId, nextStatus, requesterUserId);

  return { kind: "ok" as const, status: String(updated.rows[0]?.status || nextStatus) };
}
