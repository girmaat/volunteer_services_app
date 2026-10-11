import type { Pool } from "pg";

export async function recomputeOnboarding(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `SELECT role, requester_mode, account_type, profile_completed, availability_completed, verification_required, verification_status
     FROM users WHERE id=$1`,
    [userId]
  );
  if (rows.length === 0) return;

    const u = rows[0];

  const role = String(u.role || "");
  const requesterMode = String(u.requester_mode || "");
  const accountType = String(u.account_type || "");

  const requesterSubtypeOk =
    role !== "requester" ||
    requesterMode === "individual" ||
    requesterMode === "organization" ||
    accountType === "individual_requester" ||
    accountType === "org_requester";

  const roleOk = !!u.role && requesterSubtypeOk;
  const profileOk = !!u.profile_completed;

  const isIndividualRequester =
    role === "requester" &&
    (requesterMode === "individual" || (!requesterMode && accountType === "individual_requester"));

  const requiresAvailability = role === "volunteer" || isIndividualRequester;
  const availOk = !requiresAvailability || !!u.availability_completed;

  const verificationOk =
    !u.verification_required || ["submitted", "approved"].includes(String(u.verification_status || ""));

  const done = roleOk && profileOk && availOk && verificationOk;

  await pool.query(
    `UPDATE users SET onboarding_completed=$2, updated_at=NOW() WHERE id=$1`,
    [userId, done]
  );
}