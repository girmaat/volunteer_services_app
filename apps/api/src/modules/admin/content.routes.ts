/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express } from "express";
import { z } from "zod";
import { requirePlatformAdmin } from "../../admin/auth";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { parseLimit, parseOffset } from "./helpers";

export function registerAdminContentRoutes(app: Express) {

  // Organization management
  app.get(
    "/v1/admin/organizations",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const q = String((req.query.q as any) || "").trim();
      const status = String((req.query.status as any) || "").trim();
      const requiredRaw = String((req.query.required as any) || "").trim();
      const sortRaw = String((req.query.sort as any) || "").trim();
      const dirRaw = String((req.query.dir as any) || "").trim().toLowerCase();

      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      const wheres: string[] = [];

      if (q) {
        params.push(`%${q}%`);
        wheres.push(
          `(o.slug ILIKE $${params.length} OR o.name ILIKE $${params.length} OR COALESCE(o.contact_email,'') ILIKE $${params.length})`
        );
      }

      if (status && status !== "all") {
        if (status === "needs_review") {
          wheres.push(`o.verification_status IN ('required','submitted')`);
        } else {
          params.push(status);
          wheres.push(`o.verification_status = $${params.length}`);
        }
      }

      if (requiredRaw === "0" || requiredRaw === "1") {
        params.push(requiredRaw === "1");
        wheres.push(`o.verification_required = $${params.length}`);
      }

      const where = wheres.length ? `WHERE ${wheres.join(" AND ")}` : "";

      const sortMap: Record<string, string> = {
        updated_at: "o.updated_at",
        name: "o.name",
        members_count: "members_count",
        verification_status: "o.verification_status",
        verification_submitted_at: "o.verification_submitted_at"
      };

      const sortKey = sortMap[sortRaw] || sortMap.updated_at;
      const dir = dirRaw === "asc" ? "ASC" : "DESC";

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           o.slug,
           o.name,
           o.summary,
           o.location,
           o.mission,
           o.website_url,
           o.contact_email,
           o.logo_url,
           o.verification_required,
           o.verification_status,
           o.verification_submitted_at,
           o.verified_at,
           o.created_at,
           o.updated_at,
           (SELECT COUNT(*)::int FROM organization_members m WHERE m.org_slug = o.slug AND m.status = 'active') AS members_count
         FROM organizations o
         ${where}
         ORDER BY ${sortKey} ${dir}, o.slug ASC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({
        organizations: rows.rows,
        limit,
        offset,
        q,
        status: status || "all",
        required: requiredRaw,
        sort: sortRaw || "updated_at",
        dir: dirRaw === "asc" ? "asc" : "desc"
      });
    })
  );


  app.patch(
    "/v1/admin/organizations/:slug",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const slug = String(req.params.slug || "").trim();
      if (!slug) return res.status(400).json({ message: "Invalid org slug" });

      const schema = z
        .object({
          name: z.string().min(1).max(200).optional(),
          summary: z.string().min(1).max(2000).optional(),
          location: z.string().min(1).max(200).optional(),
          mission: z.string().max(4000).optional().nullable(),
          website_url: z.string().max(500).optional().nullable(),
          contact_email: z.string().email().optional().nullable(),
          logo_url: z.string().max(500).optional().nullable(),
          verification_required: z.boolean().optional(),
          verification_status: z.enum(["not_required", "required", "submitted", "approved", "rejected"]).optional()
        })
        .strict();

      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const fields = parsed.data as any;
      const keys = Object.keys(fields);
      if (keys.length === 0) return res.status(400).json({ message: "No changes" });

      const sets: string[] = [];
      const params: any[] = [slug];

      for (const k of keys) {
        params.push(fields[k]);
        sets.push(`${k} = $${params.length}`);
      }
      sets.push(`updated_at = NOW()`);

      const qy = `UPDATE organizations SET ${sets.join(", ")} WHERE slug = $1 RETURNING slug`;
      const upd = await pool.query(qy, params);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });
      return res.json({ ok: true });
    })
  );


  // Opportunity management (service_requests only)
  app.get(
    "/v1/admin/requests",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const q = String((req.query.q as any) || "").trim();
      const status = String((req.query.status as any) || "").trim();
      const limit = parseLimit(req.query.limit, 50, 200);
      const offset = parseOffset(req.query.offset);

      const params: any[] = [];
      const clauses: string[] = [];

      if (q) {
        params.push(`%${q}%`);
        clauses.push(`(r.title ILIKE $${params.length} OR r.description ILIKE $${params.length})`);
      }
      if (status && ["open", "paused", "closed"].includes(status)) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }

      const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

      params.push(limit);
      params.push(offset);

      const rows = await pool.query(
        `SELECT
           r.id,
           r.title,
           r.status,
           r.mode,
           r.location_text,
           r.needed_by,
           r.tags,
           r.created_at,
           r.updated_at,
           u.email AS requester_email,
           r.requester_org_slug
         FROM service_requests r
         LEFT JOIN users u ON u.id = r.requester_user_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      return res.json({ requests: rows.rows, limit, offset });
    })
  );


  app.patch(
    "/v1/admin/requests/:id",
    wrap(async (req, res) => {
      const r = await requirePlatformAdmin(pool, req, res);
      if (!r) return;

      const requestId = String(req.params.id || "").trim();
      const schema = z
        .object({
          title: z.string().min(1).max(200).optional(),
          description: z.string().min(1).max(8000).optional(),
          status: z.enum(["open", "paused", "closed"]).optional(),
          mode: z.enum(["in-person", "remote", "hybrid"]).optional().nullable(),
          location_text: z.string().max(500).optional().nullable(),
          needed_by: z.string().datetime().optional().nullable(),
          tags: z.array(z.string().min(1).max(40)).optional()
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

      const fields = parsed.data as any;
      const keys = Object.keys(fields);
      if (keys.length === 0) return res.status(400).json({ message: "No changes" });

      const sets: string[] = [];
      const params: any[] = [requestId];
      for (const k of keys) {
        let val = fields[k];
        if (k === "needed_by" && typeof val === "string") {
          val = new Date(val).toISOString();
        }
        params.push(val);
        sets.push(`${k} = $${params.length}`);
      }
      sets.push(`updated_at = NOW()`);
      const upd = await pool.query(`UPDATE service_requests SET ${sets.join(", ")} WHERE id = $1 RETURNING id`, params);
      if ((upd.rowCount ?? 0) === 0) return res.status(404).json({ message: "Service request not found" });
      return res.json({ ok: true });
    })
  );
}
