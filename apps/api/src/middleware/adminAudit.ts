/**
 * Writes one admin_audit_log row for every successful admin/moderator mutation (POST/PUT/PATCH/DELETE
 * under /v1/admin). Handlers can add detail with `res.locals.audit = { action, targetType, targetId, details }`.
 */
import type { NextFunction, Request, Response } from "express";
import { requireUserBySession } from "../auth/session";
import { pool } from "../lib/db";
import { logger } from "../lib/logger";
import { authHeaderToken } from "./auth";

const SECRET_KEYS = /pass(word)?|token|secret|key|code/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 3 || value == null) return value ?? null;
  if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : scrub(v, depth + 1);
    return out;
  }
  return value;
}

export type AuditNote = { action?: string; targetType?: string; targetId?: string; details?: Record<string, unknown> };

/**
 * Readable default action name from the route: POST /v1/admin/users/:id/strike → "users.strike",
 * DELETE /v1/admin/categories/:slug → "categories.delete".
 */
export function defaultAction(method: string, routePath: string) {
  const parts = routePath.replace(/^\/v1\/admin\/?/, "").split("/").filter((p) => p && !p.startsWith(":") && !/^[0-9a-f-]{36}$/i.test(p));
  const verb = { POST: "", PUT: "update", PATCH: "update", DELETE: "delete" }[method] ?? method.toLowerCase();
  if (!parts.length) return verb || method.toLowerCase();
  if (parts.length === 1) return verb ? `${parts[0]}.${verb}` : `${parts[0]}.create`;
  return verb ? `${parts.join(".")}.${verb}` : parts.join(".");
}

export function adminAudit(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const body = scrub(req.body);
  const fullPath = req.originalUrl.split("?")[0];
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    void (async () => {
      try {
        const token = authHeaderToken(req);
        const user = token ? await requireUserBySession(pool, token) : null;
        const note = (res.locals.audit ?? {}) as AuditNote;
        // Default target: the first id-like path segment after the resource name.
        const segs = fullPath.replace(/^\/v1\/admin\/?/, "").split("/").filter(Boolean);
        const uuid = segs.find((s) => /^[0-9a-f-]{36}$/i.test(s));
        await pool.query(
          `INSERT INTO admin_audit_log (actor_user_id, actor_role, action, method, path, target_type, target_id, details, status_code, request_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            user?.id ?? null,
            user?.platform_role ?? null,
            note.action ?? defaultAction(req.method, (req.route?.path as string | undefined) ?? fullPath),
            req.method,
            fullPath.slice(0, 300),
            note.targetType ?? segs[0] ?? null,
            note.targetId ?? uuid ?? segs[1] ?? null,
            JSON.stringify({ body, ...(note.details ?? {}) }),
            res.statusCode,
            String(res.getHeader("x-request-id") ?? "") || null
          ]
        );
      } catch (err) {
        logger.error({ err }, "admin audit write failed");
      }
    })();
  });
  next();
}
