import type { Pool } from "pg";

const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);

export async function createSession(pool: Pool, userId: string) {
  const { rows } = await pool.query(
    `INSERT INTO sessions (user_id, session_token, expires_at)
     VALUES ($1, gen_random_uuid(), NOW() + ($2::text || ' days')::interval)
     RETURNING session_token, expires_at`,
    [userId, SESSION_DAYS]
  );
  return { sessionToken: rows[0].session_token as string, expiresAt: rows[0].expires_at as string };
}

export async function deleteSession(pool: Pool, sessionToken: string) {
  await pool.query("DELETE FROM sessions WHERE session_token=$1::uuid", [sessionToken]);
}

export async function deleteAllSessionsForUser(pool: Pool, userId: string) {
  await pool.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
}

/**
 * Columns of `users` that may leave the API. Explicit on purpose: a new column (for example an
 * internal moderation note) must be added here deliberately before any client can see it.
 */
export const USER_PUBLIC_COLUMNS = [
  "id",
  "email",
  "email_verified_at",
  "phone_verified_at",
  "role",
  "account_type",
  "requester_mode",
  "profile_completed",
  "availability_completed",
  "onboarding_completed",
  "verification_required",
  "verification_status",
  "verification_submitted_at",
  "verified_at",
  "strike_count",
  "banned_until",
  "banned_reason",
  "banned_at",
  "created_at",
  "updated_at"
] as const;

const SELECT_USER = USER_PUBLIC_COLUMNS.map((c) => `u.${c}`).join(", ");

/** Returns the authenticated user for a session token (never includes password hash or admin notes). */
export async function requireUserBySession(pool: Pool, sessionToken: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sessionToken)) return null;
  const { rows } = await pool.query(
    `SELECT ${SELECT_USER}
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.session_token = $1::uuid AND s.expires_at > NOW()`,
    [sessionToken]
  );
  return rows.length === 0 ? null : (rows[0] as Record<string, any>);
}
