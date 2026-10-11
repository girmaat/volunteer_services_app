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
 * Returns the authenticated user for a session token.
 *
 * Implementation note:
 * We use `u.*` to avoid hard-coding a column list. This prevents runtime failures
 * when the DB schema is slightly behind the code (e.g., new columns added for
 * moderation/verification). We then strip sensitive fields before returning.
 */
export async function requireUserBySession(pool: Pool, sessionToken: string) {
  const { rows } = await pool.query(
    `SELECT u.*
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token = $1::uuid AND s.expires_at > NOW()`,
    [sessionToken]
  );

  if (rows.length === 0) return null;

  const user: any = rows[0];
  // Never leak password hashes to callers (most callers pass this through to the web).
  if ("password_hash" in user) delete user.password_hash;

  return user;
}
