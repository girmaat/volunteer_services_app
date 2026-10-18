/**
 * Private volunteer profiles with revocable share links (girma-fixes #12/#13).
 *
 * A volunteer's profile is never public. They create a share link (a long random token); anyone
 * with it sees their accomplishments plus whichever personal details they switched on. Creating a
 * new link or revoking it stops every earlier link at once. Under-18 volunteers can't share (SAFE-04).
 */
import crypto from "node:crypto";
import type { Express } from "express";
import { z } from "zod";
import { pool } from "../../lib/db";
import { env } from "../../lib/env";
import { wrap } from "../../lib/http";
import { minorSql } from "../../lib/age";
import { requireVolunteerUser } from "../../middleware/auth";
import { completedWork } from "./impact";
import { computeBadges } from "./badges";

export const SHARE_FIELDS = ["show_name", "show_location", "show_about", "show_total_hours", "show_average_rating", "show_reviews_count"] as const;
type ShareSettings = Record<(typeof SHARE_FIELDS)[number], boolean>;
const DEFAULTS: ShareSettings = { show_name: true, show_location: false, show_about: false, show_total_hours: true, show_average_rating: false, show_reviews_count: false };

const SettingsBody = z.object(Object.fromEntries(SHARE_FIELDS.map((f) => [f, z.boolean()])) as Record<(typeof SHARE_FIELDS)[number], z.ZodBoolean>).partial();

const shareUrl = (token: string) => `${env.WEB_BASE_URL.replace(/\/$/, "")}/p/${token}`;

async function settingsFor(userId: string): Promise<ShareSettings> {
  const r = await pool.query(`SELECT ${SHARE_FIELDS.join(", ")} FROM profile_share_settings WHERE user_id = $1`, [userId]);
  return r.rows[0] ? (Object.fromEntries(SHARE_FIELDS.map((f) => [f, Boolean(r.rows[0][f])])) as ShareSettings) : { ...DEFAULTS };
}

async function activeLink(userId: string) {
  const r = await pool.query("SELECT token, created_at, view_count, last_viewed_at FROM profile_share_links WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  const l = r.rows[0];
  return l ? { url: shareUrl(l.token), token: l.token, created_at: l.created_at, view_count: l.view_count, last_viewed_at: l.last_viewed_at } : null;
}

async function isMinor(userId: string) {
  return Boolean((await pool.query(`SELECT ${minorSql("$1::uuid")} AS m`, [userId])).rows[0]?.m);
}

/** What a shared profile shows. `preview` is the owner's own view (same content). */
export async function sharedProfile(userId: string) {
  const s = await settingsFor(userId);
  const [p, work, badges] = await Promise.all([
    pool.query(
      `SELECT COALESCE(NULLIF(up.display_name, ''), split_part(COALESCE(up.full_name, ''), ' ', 1)) AS name, up.public_location, up.bio,
              COALESCE((SELECT AVG(rating)::float FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = $1), 0) AS avg_rating,
              (SELECT COUNT(*)::int FROM visible_volunteer_reviews vr WHERE vr.volunteer_user_id = $1) AS reviews
         FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`,
      [userId]
    ),
    completedWork(userId),
    computeBadges(userId)
  ]);
  const row = p.rows[0] || {};
  const done = work.filter((w) => w.application_status === "completed" || w.hours > 0);
  const hours = Math.round(done.reduce((t, w) => t + w.hours, 0) * 10) / 10;
  return {
    settings: s,
    name: s.show_name ? row.name || "Volunteer" : null,
    location: s.show_location ? row.public_location || null : null,
    about: s.show_about ? row.bio || null : null,
    total_hours: s.show_total_hours ? hours : null,
    average_rating: s.show_average_rating && Number(row.reviews) > 0 ? Math.round(Number(row.avg_rating) * 10) / 10 : null,
    reviews_count: s.show_reviews_count ? Number(row.reviews || 0) : null,
    // Accomplishments always show: what they helped with, for whom, when and the approved hours.
    accomplishments: done.map((w) => ({
      title: w.title,
      by: w.organization_name || "A neighbor",
      completed_at: w.completed_at,
      hours: w.hours
    })),
    completed_count: done.length,
    badges: badges.badges.filter((b: { earned?: boolean }) => b.earned).map((b: { id: string; label?: string; title?: string; earned_at?: string | null }) => ({ id: b.id, label: b.label ?? b.title ?? b.id, earned_at: b.earned_at ?? null }))
  };
}

export function registerVolunteerShareProfileRoutes(app: Express) {
  app.get(
    "/v1/volunteer/profile-share",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const minor = await isMinor(String(user.id));
      return res.json({ link: minor ? null : await activeLink(String(user.id)), settings: await settingsFor(String(user.id)), can_share: !minor });
    })
  );

  // Creates a new link and cuts off any earlier one.
  app.post(
    "/v1/volunteer/profile-share",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const uid = String(user.id);
      if (await isMinor(uid)) return res.status(403).json({ message: "Profiles of volunteers under 18 can't be shared." });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("UPDATE profile_share_links SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [uid]);
        await client.query("INSERT INTO profile_share_links (user_id, token) VALUES ($1, $2)", [uid, crypto.randomBytes(24).toString("base64url")]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      return res.status(201).json({ link: await activeLink(uid) });
    })
  );

  app.post(
    "/v1/volunteer/profile-share/revoke",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const r = await pool.query("UPDATE profile_share_links SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
      return res.json({ revoked: (r.rowCount ?? 0) > 0 });
    })
  );

  app.put(
    "/v1/volunteer/profile-share/settings",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      const p = SettingsBody.safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload", errors: p.error.flatten() });
      const next = { ...(await settingsFor(String(user.id))), ...p.data };
      await pool.query(
        `INSERT INTO profile_share_settings (user_id, ${SHARE_FIELDS.join(", ")}, updated_at)
         VALUES ($1, ${SHARE_FIELDS.map((_, i) => `$${i + 2}`).join(", ")}, NOW())
         ON CONFLICT (user_id) DO UPDATE SET ${SHARE_FIELDS.map((f) => `${f} = EXCLUDED.${f}`).join(", ")}, updated_at = NOW()`,
        [user.id, ...SHARE_FIELDS.map((f) => next[f])]
      );
      return res.json({ settings: next });
    })
  );

  // The volunteer's own preview of what the link shows.
  app.get(
    "/v1/volunteer/profile-share/preview",
    wrap(async (req, res) => {
      const user = await requireVolunteerUser(req, res);
      if (!user) return;
      return res.json(await sharedProfile(String(user.id)));
    })
  );

  // Public: whoever has a live link. Revoked or replaced links are simply not found.
  app.get(
    "/v1/public/profile-shares/:token",
    wrap(async (req, res) => {
      const token = String(req.params.token || "");
      if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return res.status(404).json({ message: "This link isn't active." });
      const r = await pool.query(
        `UPDATE profile_share_links l SET view_count = view_count + 1, last_viewed_at = NOW()
          WHERE token = $1 AND revoked_at IS NULL AND NOT ${minorSql("l.user_id")}
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = l.user_id AND (u.deleted_at IS NOT NULL OR u.banned_until > NOW()))
          RETURNING user_id`,
        [token]
      );
      if (!r.rowCount) return res.status(404).json({ message: "This link isn't active." });
      const { settings: _s, ...profile } = await sharedProfile(String(r.rows[0].user_id));
      res.setHeader("cache-control", "private, no-store");
      res.setHeader("x-robots-tag", "noindex");
      return res.json(profile);
    })
  );
}
