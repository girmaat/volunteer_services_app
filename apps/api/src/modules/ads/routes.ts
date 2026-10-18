/**
 * Advertisement panels on the public pages. Platform admins turn each side (left, right) on or off,
 * and each ad on or off; an ad also stops showing after its expiry date (and before its start date).
 */
import type { Express, Request } from "express";
import { z } from "zod";
import { requirePlatformAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { checkImage, runUpload, store } from "../media/routes";

const LIVE = "a.is_active AND (a.starts_at IS NULL OR a.starts_at <= NOW()) AND (a.expires_at IS NULL OR a.expires_at > NOW())";
const COLUMNS = "a.id, a.title, a.body, a.link_url, a.image_url, a.placement, a.is_active, a.starts_at, a.expires_at, a.sort_order, a.created_at, a.updated_at";

// Links go to a page on this site or an http(s) address; nothing else (no javascript: etc.).
const Link = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^\/(?!\/)/.test(v) || /^https?:\/\/[^\s]+$/i.test(v), "Use a link that starts with https:// or /");
const When = z.string().datetime({ offset: true }).nullable();

const AdInput = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().max(300).nullable().optional(),
  link_url: Link.nullable().optional(),
  placement: z.enum(["left", "right"]),
  is_active: z.boolean().optional(),
  starts_at: When.optional(),
  expires_at: When.optional(),
  sort_order: z.coerce.number().int().min(-1000).max(1000).optional()
});

function datesOk(starts: string | null | undefined, expires: string | null | undefined) {
  return !(starts && expires && new Date(expires) <= new Date(starts));
}

export function registerAdRoutes(app: Express) {
  // What visitors see: only switched-on sides, only live ads.
  app.get(
    "/v1/public/ads",
    wrap(async (_req, res) => {
      const s = (await pool.query("SELECT ads_left_enabled, ads_right_enabled FROM platform_settings WHERE id = 1")).rows[0] ?? {};
      const r = await pool.query(`SELECT a.id, a.title, a.body, a.link_url, a.image_url, a.placement FROM ads a WHERE ${LIVE} ORDER BY a.sort_order, a.created_at DESC LIMIT 20`);
      res.set("Cache-Control", "public, max-age=60");
      return res.json({
        left: s.ads_left_enabled ? r.rows.filter((a) => a.placement === "left") : [],
        right: s.ads_right_enabled ? r.rows.filter((a) => a.placement === "right") : []
      });
    })
  );

  app.get(
    "/v1/admin/ads",
    wrap(async (req, res) => {
      if (!(await requirePlatformAdmin(pool, req, res))) return;
      const s = (await pool.query("SELECT ads_left_enabled, ads_right_enabled FROM platform_settings WHERE id = 1")).rows[0] ?? {};
      const r = await pool.query(`SELECT ${COLUMNS}, (${LIVE}) AS live FROM ads a ORDER BY a.placement, a.sort_order, a.created_at DESC`);
      return res.json({ settings: { left: Boolean(s.ads_left_enabled), right: Boolean(s.ads_right_enabled) }, ads: r.rows });
    })
  );

  app.post(
    "/v1/admin/ads/settings",
    wrap(async (req, res) => {
      const admin = await requirePlatformAdmin(pool, req, res);
      if (!admin) return;
      const p = z.object({ left: z.boolean(), right: z.boolean() }).safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Invalid payload" });
      await pool.query(
        `INSERT INTO platform_settings (id, ads_left_enabled, ads_right_enabled, updated_by_user_id, updated_at) VALUES (1, $1, $2, $3, NOW())
         ON CONFLICT (id) DO UPDATE SET ads_left_enabled = $1, ads_right_enabled = $2, updated_by_user_id = $3, updated_at = NOW()`,
        [p.data.left, p.data.right, admin.user.id]
      );
      return res.json({ ok: true, ...p.data });
    })
  );

  app.post(
    "/v1/admin/ads",
    wrap(async (req, res) => {
      const admin = await requirePlatformAdmin(pool, req, res);
      if (!admin) return;
      const p = AdInput.safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Check the ad's details", errors: p.error.flatten() });
      const d = p.data;
      if (!datesOk(d.starts_at, d.expires_at)) return res.status(400).json({ message: "The expiry date must be after the start date" });
      const r = await pool.query(
        `INSERT INTO ads (title, body, link_url, placement, is_active, starts_at, expires_at, sort_order, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [d.title, d.body || null, d.link_url || null, d.placement, d.is_active ?? true, d.starts_at ?? null, d.expires_at ?? null, d.sort_order ?? 0, admin.user.id]
      );
      return res.status(201).json({ id: r.rows[0].id });
    })
  );

  app.patch(
    "/v1/admin/ads/:id",
    wrap(async (req, res) => {
      if (!(await requirePlatformAdmin(pool, req, res))) return;
      const id = z.string().uuid().safeParse(req.params.id);
      const p = AdInput.partial().safeParse(req.body ?? {});
      if (!id.success || !p.success) return res.status(400).json({ message: "Check the ad's details", errors: p.success ? undefined : p.error.flatten() });
      const cur = (await pool.query("SELECT starts_at, expires_at FROM ads WHERE id = $1", [id.data])).rows[0];
      if (!cur) return res.status(404).json({ message: "Ad not found" });
      const starts = p.data.starts_at !== undefined ? p.data.starts_at : cur.starts_at?.toISOString?.() ?? null;
      const expires = p.data.expires_at !== undefined ? p.data.expires_at : cur.expires_at?.toISOString?.() ?? null;
      if (!datesOk(starts, expires)) return res.status(400).json({ message: "The expiry date must be after the start date" });
      const sets: string[] = [];
      const params: unknown[] = [id.data];
      for (const [k, v] of Object.entries(p.data)) {
        if (v === undefined) continue;
        params.push(v === "" ? null : v);
        sets.push(`${k} = $${params.length}`);
      }
      if (sets.length) await pool.query(`UPDATE ads SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, params);
      return res.json({ ok: true });
    })
  );

  app.delete(
    "/v1/admin/ads/:id",
    wrap(async (req, res) => {
      if (!(await requirePlatformAdmin(pool, req, res))) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      const r = await pool.query("DELETE FROM ads WHERE id = $1 RETURNING image_url", [id.data]);
      if (!r.rowCount) return res.status(404).json({ message: "Ad not found" });
      const img = r.rows[0].image_url as string | null;
      if (img) await pool.query("DELETE FROM media_images WHERE kind = 'ad' AND ('/media/' || id::text) = $1", [img]);
      return res.json({ ok: true });
    })
  );

  // Image: PNG, JPEG or WebP up to 1 MB, served from this site (multipart field "file").
  app.post(
    "/v1/admin/ads/:id/image",
    wrap(async (req, res) => {
      const admin = await requirePlatformAdmin(pool, req, res);
      if (!admin) return;
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(400).json({ message: "Invalid id" });
      if (!(await runUpload(req, res))) return;
      const file = (req as Request & { file?: Express.Multer.File }).file;
      const c = checkImage(file);
      if (!c.ok) return res.status(400).json({ message: c.message });
      const old = (await pool.query("SELECT image_url FROM ads WHERE id = $1", [id.data])).rows[0];
      if (!old) return res.status(404).json({ message: "Ad not found" });
      const path = await store("ad", admin.user.id, null, file as Express.Multer.File, c.mime);
      await pool.query("UPDATE ads SET image_url = $2, updated_at = NOW() WHERE id = $1", [id.data, path]);
      if (old.image_url) await pool.query("DELETE FROM media_images WHERE kind = 'ad' AND ('/media/' || id::text) = $1", [old.image_url]);
      return res.status(201).json({ image_url: path });
    })
  );
}
