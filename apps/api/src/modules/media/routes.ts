/**
 * Hosted images (organization logos, profile photos). Uploads are checked by content (PNG, JPEG or
 * WebP, up to 1 MB) and served from our own origin at /media/<id>; links to images on other sites
 * aren't accepted, so viewing a profile never reveals the viewer to a third party.
 */
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { requireAuthedUser } from "../../middleware/auth";
import { requireAdmin, requireOrg } from "../org/context";
import { sniffType } from "../messaging/files";

export const MAX_IMAGE_BYTES = 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }).single("file");
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

function checkImage(file: Express.Multer.File | undefined): { ok: true; mime: string } | { ok: false; message: string } {
  if (!file) return { ok: false, message: "Choose an image" };
  const mime = sniffType(file.buffer, file.originalname || "image");
  if (!mime || !IMAGE_TYPES.includes(mime)) return { ok: false, message: "Use a PNG, JPEG or WebP image" };
  return { ok: true, mime };
}

async function store(kind: "avatar" | "logo", owner: string | null, org: string | null, file: Express.Multer.File, mime: string) {
  const r = await pool.query(
    "INSERT INTO media_images (owner_user_id, org_slug, kind, mime_type, bytes, sha256) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [owner, org, kind, mime, file.buffer, crypto.createHash("sha256").update(file.buffer).digest("hex")]
  );
  return `/media/${r.rows[0].id}`;
}

function runUpload(req: Request, res: Response): Promise<boolean> {
  return new Promise((resolve) =>
    upload(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ message: (err as { code?: string })?.code === "LIMIT_FILE_SIZE" ? "Images can be up to 1 MB" : "Upload failed" });
        return resolve(false);
      }
      resolve(true);
    })
  );
}

export function registerMediaRoutes(app: Express) {
  app.post(
    "/v1/me/avatar",
    wrap(async (req, res) => {
      const user = await requireAuthedUser(req, res);
      if (!user) return;
      if (!(await runUpload(req, res))) return;
      const c = checkImage(req.file);
      if (!c.ok) return res.status(400).json({ message: c.message });
      const path = await store("avatar", user.id, null, req.file as Express.Multer.File, c.mime);
      await pool.query("INSERT INTO user_profiles (user_id, avatar_url) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET avatar_url = EXCLUDED.avatar_url, updated_at = NOW()", [user.id, path]);
      await pool.query("DELETE FROM media_images WHERE owner_user_id = $1 AND kind = 'avatar' AND ('/media/' || id::text) <> $2", [user.id, path]);
      return res.status(201).json({ avatar_url: path });
    })
  );

  app.post(
    "/v1/orgs/:orgSlug/logo",
    wrap(async (req, res) => {
      const ok = await requireOrg(pool, req, res);
      if (!ok) return;
      if (ok.ctx.org.slug !== String(req.params.orgSlug)) return res.status(404).json({ message: "Org not found" });
      if (!requireAdmin(ok.ctx, res)) return;
      if (!(await runUpload(req, res))) return;
      const c = checkImage(req.file);
      if (!c.ok) return res.status(400).json({ message: c.message });
      const path = await store("logo", null, ok.ctx.org.slug, req.file as Express.Multer.File, c.mime);
      await pool.query("UPDATE organizations SET logo_url = $2, updated_at = NOW() WHERE slug = $1", [ok.ctx.org.slug, path]);
      await pool.query("DELETE FROM media_images WHERE org_slug = $1 AND kind = 'logo' AND ('/media/' || id::text) <> $2", [ok.ctx.org.slug, path]);
      return res.status(201).json({ logo_url: path });
    })
  );

  app.get(
    "/v1/public/media/:id",
    wrap(async (req, res) => {
      const id = z.string().uuid().safeParse(req.params.id);
      if (!id.success) return res.status(404).json({ message: "Not found" });
      const r = (await pool.query("SELECT mime_type, bytes, sha256 FROM media_images WHERE id = $1", [id.data])).rows[0];
      if (!r) return res.status(404).json({ message: "Not found" });
      res.setHeader("content-type", r.mime_type);
      res.setHeader("cache-control", "public, max-age=86400");
      res.setHeader("etag", `"${r.sha256}"`);
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("content-security-policy", "default-src 'none'");
      res.setHeader("cross-origin-resource-policy", "cross-origin");
      return res.send(r.bytes);
    })
  );
}
