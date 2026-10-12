/**
 * Evidence for a contribution (CON-02/07): a link (a shared doc, a photo album) or a file (a PDF, an
 * image, a Word document). Release 2 uses this for deliverables and donated goods (receipts, photos);
 * release 1 lets volunteers and reviewers attach it to any contribution.
 *
 * Who can see it: the volunteer, and the people who review that contribution (the organization's
 * admins and managers, or the individual who posted the request). Who can add it: the same people;
 * the volunteer only while the contribution is still open (not after a final decision).
 * Who can remove it: whoever added it, under the same rule.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { z } from "zod";
import { HttpUrl } from "@thankyou/contracts";
import { pool } from "../../lib/db";
import { wrap } from "../../lib/http";
import { orgMembership, type PolicyUser } from "../../lib/policy";
import { requireAuthedUser } from "../../middleware/auth";
import { checkAttachment, MAX_ATTACHMENT_BYTES } from "../messaging/files";

export const MAX_EVIDENCE_PER_CONTRIBUTION = 10;
/** A volunteer can add or remove evidence only while the contribution can still change. */
const VOLUNTEER_OPEN = ["pending", "revision_requested", "disputed", "self_reported"];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });
const uuid = z.string().uuid();

type Access = { role: "volunteer" | "reviewer"; contribution: { id: string; status: string; volunteer_user_id: string } };

/** The caller's relationship to this contribution, or null (answered as 404: no existence leak). */
async function access(user: PolicyUser, id: string): Promise<Access | null> {
  const r = await pool.query(
    `SELECT c.id, c.status, c.volunteer_user_id, c.org_slug, r.requester_user_id
       FROM contributions c LEFT JOIN service_requests r ON r.id = c.request_id WHERE c.id = $1`,
    [id]
  );
  const c = r.rows[0];
  if (!c) return null;
  const contribution = { id: String(c.id), status: String(c.status), volunteer_user_id: String(c.volunteer_user_id) };
  if (contribution.volunteer_user_id === user.id) return { role: "volunteer", contribution };
  if (c.org_slug) {
    const m = orgMembership(user, String(c.org_slug));
    return m && (m.role === "admin" || m.role === "manager") ? { role: "reviewer", contribution } : null;
  }
  return c.requester_user_id && String(c.requester_user_id) === user.id ? { role: "reviewer", contribution } : null;
}

async function load(req: Request, res: Response) {
  const user = (await requireAuthedUser(req, res)) as PolicyUser | null;
  if (!user) return null;
  const id = uuid.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ message: "Invalid id" });
    return null;
  }
  const a = await access(user, id.data);
  if (!a) {
    res.status(404).json({ message: "Contribution not found" });
    return null;
  }
  return { user, ...a };
}

function canChange(a: Access) {
  return a.role === "reviewer" || VOLUNTEER_OPEN.includes(a.contribution.status);
}

async function roomFor(contributionId: string) {
  const n = (await pool.query("SELECT COUNT(*)::int AS n FROM contribution_evidence WHERE contribution_id = $1", [contributionId])).rows[0].n as number;
  return n < MAX_EVIDENCE_PER_CONTRIBUTION;
}

export async function listEvidence(contributionId: string) {
  const r = await pool.query(
    `SELECT e.id, e.kind, e.url, e.label, e.file_name, e.mime_type, octet_length(e.bytes)::int AS size_bytes, e.created_at, e.added_by_user_id,
            COALESCE(NULLIF(p.display_name, ''), split_part(COALESCE(p.full_name, ''), ' ', 1), 'Someone') AS added_by_name
       FROM contribution_evidence e LEFT JOIN user_profiles p ON p.user_id = e.added_by_user_id
      WHERE e.contribution_id = $1 ORDER BY e.created_at`,
    [contributionId]
  );
  return r.rows.map((e) => ({ ...e, download_path: e.kind === "file" ? `/v1/contributions/${contributionId}/evidence/${e.id}/file` : null }));
}

/** Evidence metadata (never the bytes) for many contributions in one query, keyed by contribution id. */
export async function evidenceFor(contributionIds: string[]) {
  const out = new Map<string, { id: string; kind: string; url: string | null; label: string | null; file_name: string | null }[]>();
  if (!contributionIds.length) return out;
  const r = await pool.query(
    "SELECT id, contribution_id, kind, url, label, file_name FROM contribution_evidence WHERE contribution_id = ANY($1::uuid[]) ORDER BY created_at",
    [contributionIds]
  );
  for (const e of r.rows) {
    const k = String(e.contribution_id);
    out.set(k, [...(out.get(k) ?? []), { id: String(e.id), kind: e.kind, url: e.url ?? null, label: e.label ?? null, file_name: e.file_name ?? null }]);
  }
  return out;
}

export function registerEvidenceRoutes(app: Express) {
  app.get(
    "/v1/contributions/:id/evidence",
    wrap(async (req, res) => {
      const a = await load(req, res);
      if (!a) return;
      return res.json({ evidence: await listEvidence(a.contribution.id), can_add: canChange(a), max: MAX_EVIDENCE_PER_CONTRIBUTION });
    })
  );

  // A link: JSON { url, label? }.
  app.post(
    "/v1/contributions/:id/evidence",
    wrap(async (req, res) => {
      const a = await load(req, res);
      if (!a) return;
      if (!canChange(a)) return res.status(409).json({ message: "This contribution has been decided; ask the reviewer to reopen it to add evidence" });
      const p = z.object({ url: HttpUrl, label: z.string().trim().max(120).optional() }).strict().safeParse(req.body ?? {});
      if (!p.success) return res.status(400).json({ message: "Add a link that starts with https://", errors: p.error.flatten() });
      if (!(await roomFor(a.contribution.id))) return res.status(409).json({ message: `Up to ${MAX_EVIDENCE_PER_CONTRIBUTION} pieces of evidence per contribution` });
      const r = await pool.query(
        "INSERT INTO contribution_evidence (contribution_id, added_by_user_id, kind, url, label) VALUES ($1, $2, 'link', $3, $4) RETURNING id",
        [a.contribution.id, a.user.id, p.data.url, p.data.label || null]
      );
      return res.status(201).json({ id: r.rows[0].id });
    })
  );

  // A file: multipart field "file", optional "label".
  app.post(
    "/v1/contributions/:id/evidence/file",
    upload.single("file"),
    wrap(async (req, res) => {
      const a = await load(req, res);
      if (!a) return;
      if (!canChange(a)) return res.status(409).json({ message: "This contribution has been decided; ask the reviewer to reopen it to add evidence" });
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ message: "Choose a file" });
      const name = String(file.originalname || "file").slice(0, 150);
      const check = await checkAttachment(file.buffer, name);
      if (!check.ok) return res.status(422).json({ error: { code: "file_rejected", message: check.reason }, message: check.reason });
      if (!(await roomFor(a.contribution.id))) return res.status(409).json({ message: `Up to ${MAX_EVIDENCE_PER_CONTRIBUTION} pieces of evidence per contribution` });
      const label = String((req.body as { label?: string })?.label || "").trim().slice(0, 120) || null;
      const r = await pool.query(
        `INSERT INTO contribution_evidence (contribution_id, added_by_user_id, kind, label, file_name, mime_type, bytes, sha256)
         VALUES ($1, $2, 'file', $3, $4, $5, $6, $7) RETURNING id`,
        [a.contribution.id, a.user.id, label, name, check.mime, file.buffer, check.sha256]
      );
      return res.status(201).json({ id: r.rows[0].id });
    })
  );

  app.get(
    "/v1/contributions/:id/evidence/:evidenceId/file",
    wrap(async (req, res) => {
      const a = await load(req, res);
      if (!a) return;
      const eid = uuid.safeParse(req.params.evidenceId);
      if (!eid.success) return res.status(400).json({ message: "Invalid id" });
      const r = await pool.query("SELECT file_name, mime_type, bytes FROM contribution_evidence WHERE id = $1 AND contribution_id = $2 AND kind = 'file'", [eid.data, a.contribution.id]);
      const e = r.rows[0];
      if (!e) return res.status(404).json({ message: "File not found" });
      res.set("Content-Type", String(e.mime_type));
      res.set("Content-Disposition", `attachment; filename="${String(e.file_name).replace(/[^\w.\- ]/g, "_")}"`);
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Cache-Control", "private, no-store");
      return res.send(e.bytes);
    })
  );

  app.delete(
    "/v1/contributions/:id/evidence/:evidenceId",
    wrap(async (req, res) => {
      const a = await load(req, res);
      if (!a) return;
      const eid = uuid.safeParse(req.params.evidenceId);
      if (!eid.success) return res.status(400).json({ message: "Invalid id" });
      if (!canChange(a)) return res.status(409).json({ message: "This contribution has been decided; its evidence is part of the record" });
      const r = await pool.query("DELETE FROM contribution_evidence WHERE id = $1 AND contribution_id = $2 AND added_by_user_id = $3", [eid.data, a.contribution.id, a.user.id]);
      if (!r.rowCount) return res.status(404).json({ message: "Evidence not found" });
      return res.json({ ok: true });
    })
  );
}
