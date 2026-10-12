import { pool } from "./db";

/** Minimum age to hold an account during the pilot (SAFE-01). */
export const MIN_ACCOUNT_AGE = 16;
export const ADULT_AGE = 18;

/** Whole years between a YYYY-MM-DD birth date and `on` (default now). */
export function ageOn(birthDate: string | Date | null | undefined, on: Date = new Date()): number | null {
  if (!birthDate) return null;
  const b = typeof birthDate === "string" ? new Date(`${birthDate.slice(0, 10)}T00:00:00Z`) : birthDate;
  if (Number.isNaN(b.getTime())) return null;
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/** Parses a YYYY-MM-DD string into a date that exists, or null. */
export function parseBirthDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  if (d > new Date() || d.getUTCFullYear() < 1900) return null;
  return s;
}

export type AgeInfo = { birthDate: string | null; age: number | null; minor: boolean; adultAttested: boolean };

/** A user's age facts. Unknown birth date with an adult attestation counts as adult; unknown otherwise is "unknown". */
export async function ageInfo(userId: string): Promise<AgeInfo> {
  const r = await pool.query(
    "SELECT to_char(p.birth_date, 'YYYY-MM-DD') AS birth_date, u.adult_attested_at FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1",
    [userId]
  );
  const row = r.rows[0] ?? {};
  const age = ageOn(row.birth_date);
  return { birthDate: row.birth_date ?? null, age, minor: age !== null && age < ADULT_AGE, adultAttested: Boolean(row.adult_attested_at) };
}

/** SQL expression: true when the user (by id column) is under 18 today. */
export const minorSql = (userIdCol: string) =>
  `EXISTS (SELECT 1 FROM user_profiles mp WHERE mp.user_id = ${userIdCol} AND mp.birth_date > (CURRENT_DATE - INTERVAL '18 years'))`;

/**
 * Organization staff must be adults. A known minor is refused. With no birth date on file the person
 * confirms they're 18 or older (recorded once as adult_attested_at). Returns a message to show, or null.
 */
export async function staffAdultCheck(userId: string, adultConfirmed: unknown): Promise<string | null> {
  const a = await ageInfo(userId);
  if (a.age !== null) return a.age < ADULT_AGE ? "Organization team members must be 18 or older." : null;
  if (a.adultAttested) return null;
  if (adultConfirmed !== true) return "Confirm you're 18 or older to join an organization's team.";
  await pool.query("UPDATE users SET adult_attested_at = NOW() WHERE id = $1 AND adult_attested_at IS NULL", [userId]);
  return null;
}

/**
 * SQL condition for listings: false when the viewer (a user-id SQL expression, may be NULL) is a
 * known minor and the request is from an individual or has a minimum age above theirs (SAFE-01/04).
 */
export const visibleToViewerAgeSql = (requestAlias: string, viewerIdExpr: string) =>
  `NOT EXISTS (SELECT 1 FROM user_profiles vap WHERE vap.user_id = ${viewerIdExpr} AND vap.birth_date > (CURRENT_DATE - INTERVAL '18 years')
     AND (${requestAlias}.requester_org_slug IS NULL OR COALESCE(${requestAlias}.min_age, 0) > date_part('year', age(CURRENT_DATE, vap.birth_date))))`;
