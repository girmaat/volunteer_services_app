import { contentDisposition } from "./lib/http";
import { parsePage, toPage } from "./lib/pagination";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { z } from "zod";
import * as authHandlers from "./auth/handlers";
import { requireUserBySession } from "./auth/session";
import { pendingMigrations } from "./db/migrator";
import { createPool } from "./db";
import { backfillRecentServiceRequestGeo, ensureServiceRequestGeo, ensureUserGeo } from "./geo";
import { registerOrgRoutes } from "./routes/org";
import { requirePlatformAdmin as requirePlatformAdminAccess } from "./admin/auth";
import { registerAdminRoutes } from "./routes/admin";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(express.json({ limit: "1mb" }));

if (process.env.LOG_REQUESTS === "true") {
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      // eslint-disable-next-line no-console
      console.log(`[req] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
    });
    next();
  });
}

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3002";
app.use(cors({ origin: corsOrigin }));

const pool = createPool(process.env.DATABASE_URL);
const migrationPool = createPool(process.env.DATABASE_URL_MIGRATIONS || process.env.DATABASE_URL);



// Public-safe rendering helpers (marketing pages must never leak private contact or exact addresses)
const STREET_WORDS = [
  "street","st","avenue","ave","road","rd","boulevard","blvd","lane","ln","drive","dr","court","ct","place","pl","way","parkway","pkwy","circle","cir","suite","ste","apt","apartment","unit"
];

function redactEmails(text: string) {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]");
}

function redactPhones(text: string) {
  // Common US phone patterns
  return text.replace(/(?:\+?1[\s.-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g, "[redacted phone]");
}

function redactAddressLike(text: string) {
  // Replace obvious street-address patterns like "123 Main St" (keeps the rest of the sentence)
  const streetRe = new RegExp(
    String.raw`\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:${STREET_WORDS.join("|")})\b`,
    "gi"
  );
  return text.replace(streetRe, "[address redacted]");
}

function sanitizePublicDescription(text: string) {
  const input = String(text || "");
  // Keep it readable but remove likely private info
  let out = input;
  out = redactEmails(out);
  out = redactPhones(out);
  out = redactAddressLike(out);
  return out;
}

function looksPreciseLocation(text: string) {
  const t = String(text || "").toLowerCase();
  if (!t) return false;
  // Digits often indicate a street number or unit/zip. Also block @ mentions (emails) and common street words.
  if (/\d/.test(t)) return true;
  if (t.includes("@")) return true;
  return STREET_WORDS.some((w) => t.includes(` ${w}`) || t.endsWith(` ${w}`));
}

function derivePublicLocation(mode: string, rawLocation: string | null | undefined, orgLocation: string | null | undefined) {
  const m = String(mode || "remote").toLowerCase();
  if (m === "remote") return "Remote";

  // Prefer the request's own area (reduced to "City, ST"), then the organization's area.
  const raw = String(rawLocation || "").trim();
  if (raw) {
    if (!looksPreciseLocation(raw)) {
      const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
      return parts.length > 2 ? parts.slice(-2).join(", ") : raw;
    }
    // Try to reduce "123 Main St, City, ST 02139" -> "City, ST"
    const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const cityState = parts.slice(-2).join(", ").replace(/\b\d{5}(?:-\d{4})?\b/g, "").trim();
      if (cityState && !looksPreciseLocation(cityState)) return cityState;
    }
  }

  const orgLoc = String(orgLocation || "").trim();
  if (orgLoc && !looksPreciseLocation(orgLoc)) return orgLoc;

  // If we can't safely derive, never leak the raw string
  return "Location shared after you apply";
}



const {
  signup,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  me,
  logout,
  setRole,
  setRequesterMode,
  setProfile,
  setAvailability,
  skipAvailability,
  submitVerification,
  verificationUploadMiddleware
} = authHandlers as any;

function wrap(fn: (req: express.Request, res: express.Response) => Promise<any>) {
  return (req: express.Request, res: express.Response) => {
    Promise.resolve(fn(req, res)).catch((e: any) => {
      // eslint-disable-next-line no-console
      console.error("[ThankYou Backend] Unhandled route error", e);
      if (!res.headersSent) {
        res.status(500).json({ message: "Internal server error" });
      }
    });
  };
}

function authHeaderToken(req: express.Request): string | null {
  const header = req.header("authorization") || "";
  const parts = header.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") return parts[1];
  return null;
}


async function optionalAuthedUser(req: express.Request) {
  const token = authHeaderToken(req);
  if (!token) return null;
  try {
    const user = await requireUserBySession(pool, token);
    return user || null;
  } catch {
    return null;
  }
}


async function requireAuthedUser(req: express.Request, res: express.Response) {
  const token = authHeaderToken(req);
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const user = await requireUserBySession(pool, token);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (!user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }

  return user;
}

async function isBlockedBetween(userId: string, peerId: string): Promise<boolean> {
  const r = await pool.query(
    `
    SELECT 1
    FROM user_blocks b
    WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = $2)
       OR (b.blocker_user_id = $2 AND b.blocked_user_id = $1)
    LIMIT 1
    `,
    [userId, peerId]
  );
  return (r.rowCount ?? 0) > 0;
}

type MessagingPermission = "anyone" | "verified_only" | "no_one";

async function getMessagingPermission(userId: string): Promise<MessagingPermission> {
  const r = await pool.query("SELECT messaging_permission FROM user_privacy_settings WHERE user_id = $1", [userId]);
  const perm = r.rowCount ? String(r.rows[0]?.messaging_permission || "anyone") : "anyone";
  if (perm === "verified_only" || perm === "no_one" || perm === "anyone") return perm;
  return "anyone";
}

async function canSendDirectMessage(sender: any, recipientUserId: string): Promise<{ allowed: boolean; reason?: string }> {
  if (!recipientUserId) return { allowed: false, reason: "Invalid recipient." };
  if (String(sender?.id || "") === String(recipientUserId)) return { allowed: true };
  if (sender?.is_platform_admin) return { allowed: true };

  const perm = await getMessagingPermission(recipientUserId);
  if (perm === "anyone") return { allowed: true };

  if (perm === "verified_only") {
    // Login requires verified email, but keep the check for safety.
    if (sender?.email_verified_at) return { allowed: true };
    return { allowed: false, reason: "Only verified users can message this user." };
  }

  // perm === 'no_one'
  return { allowed: false, reason: "This user is not accepting direct messages right now." };
}


async function requireVolunteerUser(req: express.Request, res: express.Response) {
  const token = authHeaderToken(req);
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const user = await requireUserBySession(pool, token);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (user.role !== "volunteer" && user.role !== "requester") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  if (!user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }

  return user;
}


async function requireRequesterUser(req: express.Request, res: express.Response) {
  const token = authHeaderToken(req);
  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  const user = await requireUserBySession(pool, token);
  if (!user) {
    res.status(401).json({ message: "Not authenticated" });
    return null;
  }

  if (user.banned_until) {
    const until = new Date(user.banned_until as any).getTime();
    if (!Number.isNaN(until) && until > Date.now()) {
      res.status(403).json({ message: "Account is banned", banned_until: user.banned_until, banned_reason: (user as any).banned_reason || null });
      return null;
    }
  }

  if (user.role !== "requester") {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }

  if (!user.onboarding_completed) {
    res.status(403).json({ message: "Onboarding incomplete" });
    return null;
  }

  return user;
}


async function getOptionalAuthedUser(req: express.Request) {
  const token = authHeaderToken(req);
  if (!token) return null;
  const user = await requireUserBySession(pool, token);
  return user || null;
}

function randomToken() {
  // 16 bytes => 22 chars base64url (no padding)
  return crypto.randomBytes(16).toString("base64url");
}

function normalizeVisibility(v: any) {
  const raw = String(v || "").trim().toLowerCase();
  if (raw === "public" || raw === "link_only" || raw === "logged_in_only" || raw === "private") return raw;
  return "link_only";
}

async function isActiveOrgMember(userId: string, orgSlug: string) {
  const rows = await pool.query(
    `SELECT 1 FROM organization_members WHERE user_id = $1 AND org_slug = $2 AND status = 'active' LIMIT 1`,
    [userId, orgSlug]
  );
  return (rows.rowCount ?? 0) > 0;
}

function requiresAuthByType(shareType: string) {
  // In this codebase, org/opportunity/service-request experiences are logged-in surfaces.
  return shareType === "ORGANIZATION" || shareType === "OPPORTUNITY" || shareType === "SERVICE_REQUEST";
}

function hashIp(req: express.Request) {
  const salt = String(process.env.IP_HASH_SALT || "");
  if (!salt) return null;

  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded as string) || req.socket.remoteAddress || "";
  if (!ip) return null;

  return crypto.createHash("sha256").update(`${salt}|${ip}`).digest("hex");
}

function isPlatformAdminEmail(email: string) {
  const allow = String(process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;
  return allow.includes(String(email || "").trim().toLowerCase());
}

async function requirePlatformAdmin(req: express.Request, res: express.Response) {
  const user = await requireAuthedUser(req, res);
  if (!user) return null;
  if (!isPlatformAdminEmail((user as any).email)) {
    res.status(403).json({ message: "Forbidden" });
    return null;
  }
  return user;
}

// Platform-admin org verification queue + decisions
app.get(
  "/v1/admin/org-verification/queue",
  wrap(async (req, res) => {
    const r = await requirePlatformAdminAccess(pool, req, res);
    if (!r) return;
    const { user } = r;

    const rows = await pool.query(
      `
      SELECT
        slug,
        name,
        contact_email,
        verification_required,
        verification_status,
        verification_submitted_at,
        verification_submission_notes,
        verification_notes,
        verified_at,
        updated_at
      FROM organizations
      WHERE verification_required = TRUE
         OR verification_status IN ('required','submitted','rejected')
      ORDER BY COALESCE(verification_submitted_at, updated_at) DESC
      LIMIT 200
      `
    );

    return res.json({ orgs: rows.rows });
  })
);

app.post(
  "/v1/admin/org-verification/:slug/approve",
  wrap(async (req: any, res: any) => {
    const r = await requirePlatformAdminAccess(pool, req, res);
    if (!r) return;
    const { user } = r;

    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "Invalid org slug" });

    const schema = z.object({ notes: z.string().max(4000).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const notes = parsed.data.notes ? String(parsed.data.notes).trim() : null;

    const updated = await pool.query(
      `
      UPDATE organizations
         SET verification_required = FALSE,
             verification_status = 'approved',
             verified_at = NOW(),
             verified_by_user_id = $2,
             verification_notes = $3,
             updated_at = NOW()
       WHERE slug = $1
       RETURNING slug
      `,
      [slug, String((user as any).id), notes]
    );

    if ((updated.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });
    return res.json({ ok: true });
  })
);

app.post(
  "/v1/admin/org-verification/:slug/reject",
  wrap(async (req: any, res: any) => {
    const r = await requirePlatformAdminAccess(pool, req, res);
    if (!r) return;
    const { user } = r;

    const slug = String(req.params.slug || "").trim();
    if (!slug) return res.status(400).json({ message: "Invalid org slug" });

    const schema = z.object({ notes: z.string().max(4000).optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const notes = parsed.data.notes ? String(parsed.data.notes).trim() : null;

    const updated = await pool.query(
      `
      UPDATE organizations
         SET verification_required = TRUE,
             verification_status = 'rejected',
             verification_notes = $2,
             updated_at = NOW()
       WHERE slug = $1
       RETURNING slug
      `,
      [slug, notes]
    );

    if ((updated.rowCount ?? 0) === 0) return res.status(404).json({ message: "Organization not found" });
    return res.json({ ok: true });
  })
);

// Health
app.get("/v1/health", async (_req, res) => {
  try {
    const started = Date.now();
    await pool.query("SELECT 1 as ok");
    const ms = Date.now() - started;
    res.json({ status: "ok", db: "ok", dbLatencyMs: ms });
  } catch (e: any) {
    res.status(500).json({ status: "error", db: "error", message: e?.message || "db error" });
  }
});

// Public content
app.get("/v1/public/pages/:slug", async (req, res) => {
  const slug = req.params.slug;
  const rows = await pool.query(
    "SELECT slug, title, body, updated_at FROM public_pages WHERE slug = $1",
    [slug]
  );
  if (rows.rowCount === 0) {
    return res.status(404).json({ message: "Page not found" });
  }
  return res.json(rows.rows[0]);
});


app.get(
  "/v1/public/stories",
  wrap(async (_req, res) => {
    const rows = await pool.query(
      `
      SELECT
        id,
        slug,
        title,
        excerpt,
        body,
        cover_image_url,
        updated_at
      FROM impact_stories
      ORDER BY updated_at DESC
      `
    );

    // Ensure callers always get a usable slug (and we can keep body for back-compat generation)
    const stories = rows.rows.map((r: any) => {
      const slug =
        r.slug ||
        `${String(r.title || "story")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")}-${r.id}`;
      const body = r.body ?? r.excerpt;
      return {
        id: r.id,
        slug,
        title: r.title,
        excerpt: r.excerpt,
        updated_at: r.updated_at,
        cover_image_url: r.cover_image_url ?? null,
        body
      };
    });

    return res.json(stories.map(({ body, ...rest }) => rest)); // list stays lightweight
  })
);

app.get(
  "/v1/public/stories/:slug",
  wrap(async (req, res) => {
    const slugParam = String(req.params.slug || "").trim();
    if (!slugParam) return res.status(400).json({ message: "Invalid story slug" });

    // Back-compat: allow numeric id
    const isNumeric = /^\d+$/.test(slugParam);

    const rows = await pool.query(
      isNumeric
        ? `
          SELECT id, slug, title, excerpt, body, cover_image_url, updated_at
          FROM impact_stories
          WHERE id = $1
          LIMIT 1
          `
        : `
          SELECT id, slug, title, excerpt, body, cover_image_url, updated_at
          FROM impact_stories
          WHERE slug = $1
          LIMIT 1
          `,
      [isNumeric ? Number(slugParam) : slugParam]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Story not found" });

    const r = rows.rows[0] as any;
    const slug =
      r.slug ||
      `${String(r.title || "story")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")}-${r.id}`;
    const body = r.body ?? r.excerpt;

    return res.json({
      id: r.id,
      slug,
      title: r.title,
      excerpt: r.excerpt,
      body,
      cover_image_url: r.cover_image_url ?? null,
      updated_at: r.updated_at
    });
  })
);

// ---------------------------------------------------------------------------
// Public read endpoints. No authentication: these back the SEO-indexed public
// pages. They return whitelisted, redacted fields only (no contact details,
// no exact addresses, no private profile data).
// ---------------------------------------------------------------------------

app.get(
  "/v1/public/organizations",
  wrap(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>, { limit: 24, max: 50 });
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    const rows = await pool.query(
      `SELECT slug, name, summary, location, verification_status, verified_at, updated_at
         FROM organizations
        WHERE ($1::text = '' OR name ILIKE '%' || $1 || '%' OR summary ILIKE '%' || $1 || '%')
        ORDER BY (verification_status = 'approved') DESC, name ASC
        LIMIT $2 OFFSET $3`,
      [q, page.limit + 1, page.offset]
    );
    const items = rows.rows.map((o: any) => ({
      slug: o.slug,
      name: o.name,
      summary: sanitizePublicDescription(String(o.summary || "")),
      location: looksPreciseLocation(String(o.location || "")) ? null : o.location,
      verified: o.verification_status === "approved",
      updated_at: o.updated_at
    }));
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(toPage(items, page));
  })
);

app.get(
  "/v1/public/organizations/:slug",
  wrap(async (req, res) => {
    const slug = String(req.params.slug || "").slice(0, 120);
    const rows = await pool.query(
      `SELECT o.slug, o.name, o.summary, o.location, o.mission, o.website_url, o.logo_url,
              o.verification_status, o.verified_at, o.updated_at,
              (SELECT COUNT(*)::int FROM service_requests r WHERE r.requester_org_slug = o.slug AND r.status = 'open') AS open_requests
         FROM organizations o
        WHERE o.slug = $1`,
      [slug]
    );
    if (rows.rowCount === 0) return res.status(404).json({ message: "Organization not found" });
    const o: any = rows.rows[0];
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=300");
    return res.json({
      slug: o.slug,
      name: o.name,
      summary: sanitizePublicDescription(String(o.summary || "")),
      mission: o.mission ? sanitizePublicDescription(String(o.mission)) : null,
      location: looksPreciseLocation(String(o.location || "")) ? null : o.location,
      website_url: /^https?:\/\//i.test(String(o.website_url || "")) ? o.website_url : null,
      logo_url: o.logo_url ?? null,
      verified: o.verification_status === "approved",
      verification_status: o.verification_status,
      verified_at: o.verified_at,
      open_requests: o.open_requests,
      updated_at: o.updated_at
    });
  })
);

const PUBLIC_MODES = new Set(["in-person", "remote", "hybrid"]);

app.get(
  "/v1/public/opportunities",
  wrap(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>, { limit: 24, max: 50 });
    const orgSlug = typeof req.query.org === "string" && req.query.org.trim() ? req.query.org.trim().slice(0, 120) : null;
    const mode = typeof req.query.mode === "string" && PUBLIC_MODES.has(req.query.mode) ? req.query.mode : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";

    const rows = await pool.query(
      `SELECT r.id, r.title, r.description, r.location_text, COALESCE(r.mode, 'remote') AS mode,
              r.tags, r.needed_by, r.updated_at,
              org.name AS organization_name, org.slug AS organization_slug,
              (org.verification_status = 'approved') AS organization_verified,
              org.location AS org_location
         FROM service_requests r
         LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE r.status = 'open'
          AND ($1::text IS NULL OR r.requester_org_slug = $1)
          AND ($2::text IS NULL OR COALESCE(r.mode, 'remote') = $2)
          AND ($3::text = '' OR r.title ILIKE '%' || $3 || '%' OR r.description ILIKE '%' || $3 || '%')
        ORDER BY r.updated_at DESC, r.id
        LIMIT $4 OFFSET $5`,
      [orgSlug, mode, q, page.limit + 1, page.offset]
    );

    const items = rows.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      summary: sanitizePublicDescription(String(r.description || "")).slice(0, 240),
      location: derivePublicLocation(String(r.mode || "remote"), r.location_text, r.org_location),
      mode: r.mode,
      tags: Array.isArray(r.tags) ? r.tags : [],
      needed_by: r.needed_by,
      organization_name: r.organization_name ?? null,
      organization_slug: r.organization_slug ?? null,
      organization_verified: Boolean(r.organization_verified),
      updated_at: r.updated_at
    }));
    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    return res.json(toPage(items, page));
  })
);

app.get(
  "/v1/public/opportunities/:id",
  wrap(async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });

    const rows = await pool.query(
      `SELECT r.id, r.title, r.description, r.location_text, COALESCE(r.mode, 'remote') AS mode,
              r.tags, r.needed_by, r.updated_at,
              org.name AS organization_name, org.slug AS organization_slug,
              (org.verification_status = 'approved') AS organization_verified,
              org.location AS org_location
         FROM service_requests r
         LEFT JOIN organizations org ON org.slug = r.requester_org_slug
        WHERE r.id = $1 AND r.status = 'open'`,
      [idParsed.data]
    );
    if (rows.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    const r: any = rows.rows[0];
    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    return res.json({
      id: r.id,
      title: r.title,
      summary: sanitizePublicDescription(String(r.description || "")),
      location: derivePublicLocation(String(r.mode || "remote"), r.location_text, r.org_location),
      mode: r.mode,
      tags: Array.isArray(r.tags) ? r.tags : [],
      needed_by: r.needed_by,
      organization_name: r.organization_name ?? null,
      organization_slug: r.organization_slug ?? null,
      organization_verified: Boolean(r.organization_verified),
      updated_at: r.updated_at
    });
  })
);

// Public: volunteer profile (Step 3.16)
app.get("/v1/public/volunteers/:id", wrap(async (req, res) => {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid volunteer id" });

  const volunteerId = parsed.data.id;

  const row = await pool.query(
    `
    SELECT
      u.id,
      (u.email_verified_at IS NOT NULL) AS email_verified,
      u.verification_status,
      COALESCE(NULLIF(up.display_name, ''), split_part(COALESCE(up.full_name, ''), ' ', 1)) AS display_name,
      up.avatar_url,
      up.public_location AS public_location,
      up.bio,
      up.languages,
      up.interaction_styles,
      up.help_categories,
      up.has_car,
      up.can_lift_heavy,
      up.stairs_ok,
      up.pet_friendly,
      up.service_radius_miles,
      up.experience,
      u.created_at,
      up.updated_at AS profile_updated_at,
      COALESCE(ups.public_profile_visible, TRUE) AS public_profile_visible,
      COALESCE((SELECT COUNT(*)::int FROM request_applications ra WHERE ra.volunteer_user_id = u.id), 0) AS applications_count,
      COALESCE((SELECT COUNT(*)::int FROM request_commitments c WHERE c.volunteer_user_id = u.id), 0) AS commitments_total_count,
      COALESCE((SELECT COUNT(*)::int FROM request_commitments c WHERE c.volunteer_user_id = u.id AND c.status = 'completed'), 0) AS completed_count,
      COALESCE((SELECT COUNT(*)::int FROM request_commitments c WHERE c.volunteer_user_id = u.id AND c.status = 'canceled'), 0) AS canceled_count,

      COALESCE((SELECT COUNT(*)::int
        FROM volunteer_impact_entries vie
        WHERE vie.volunteer_user_id = u.id
      ), 0) AS impact_entries_count,

      COALESCE((SELECT COALESCE(SUM(hours),0)::float FROM volunteer_impact_entries vie WHERE vie.volunteer_user_id = u.id), 0) AS total_hours,
      COALESCE((SELECT COUNT(*)::int FROM volunteer_reviews vr WHERE vr.volunteer_user_id = u.id), 0) AS reviews_count,
      COALESCE((SELECT COUNT(*)::int FROM volunteer_reviews vr WHERE vr.volunteer_user_id = u.id AND vr.would_work_again = TRUE), 0) AS endorsements_count,
      COALESCE((SELECT COALESCE(AVG(rating),0)::float FROM volunteer_reviews vr WHERE vr.volunteer_user_id = u.id), 0) AS average_rating,
      (
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)
        FROM (
          SELECT EXTRACT(EPOCH FROM (reply.created_at - msg.created_at))::float AS seconds
          FROM direct_messages msg
          JOIN LATERAL (
            SELECT created_at
            FROM direct_messages reply
            WHERE reply.sender_user_id = u.id
              AND reply.recipient_user_id = msg.sender_user_id
              AND reply.created_at > msg.created_at
            ORDER BY reply.created_at ASC
            LIMIT 1
          ) reply ON TRUE
          WHERE msg.recipient_user_id = u.id
            AND msg.sender_user_id <> u.id
            AND msg.created_at >= NOW() - INTERVAL '90 days'
            AND reply.created_at <= msg.created_at + INTERVAL '7 days'
        ) deltas
      ) AS median_reply_seconds
    FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN user_privacy_settings ups ON ups.user_id = u.id
    WHERE u.id = $1 AND u.role = 'volunteer'
    `,
    [volunteerId]
  );

  if (row.rowCount === 0) return res.status(404).json({ message: "Volunteer not found" });

  const r: any = row.rows[0];

  const viewer = await optionalAuthedUser(req);
  const viewerId = viewer ? String((viewer as any).id || "") : "";
  const isAdmin = !!(viewer && (viewer as any).is_platform_admin);
  const visible = !!r.public_profile_visible;
  const canView = visible || viewerId === volunteerId || isAdmin;
  if (!canView) return res.status(404).json({ message: "Volunteer not found" });

  const commitmentsTotal = Number(r.commitments_total_count || 0);
  const canceled = Number(r.canceled_count || 0);
  const cancellation_rate = commitmentsTotal > 0 ? canceled / commitmentsTotal : null;

  return res.json({
    id: r.id,
    display_name: r.display_name || null,
    avatar_url: r.avatar_url || null,
    public_location: r.public_location || null,
    bio: r.bio || null,
    languages: r.languages || [],
    interaction_styles: r.interaction_styles || [],
    help_categories: r.help_categories || [],
    logistics: {
      has_car: typeof r.has_car === "boolean" ? r.has_car : null,
      can_lift_heavy: typeof r.can_lift_heavy === "boolean" ? r.can_lift_heavy : null,
      stairs_ok: typeof r.stairs_ok === "boolean" ? r.stairs_ok : null,
      pet_friendly: typeof r.pet_friendly === "boolean" ? r.pet_friendly : null,
      service_radius_miles: r.service_radius_miles ?? null
    },
    experience: r.experience || null,
    verification: {
      email_verified: !!r.email_verified,
      id_verification_status: r.verification_status || null
    },
    created_at: r.created_at,
    profile_updated_at: r.profile_updated_at || null,
    stats: {
      applications_count: Number(r.applications_count || 0),
      completed_count: Number(r.completed_count || 0),
      canceled_count: Number(r.canceled_count || 0),
      cancellation_rate,
      total_hours: Number(r.total_hours || 0),
      reviews_count: Number(r.reviews_count || 0),
      endorsements_count: Number(r.endorsements_count || 0),
      average_rating: Number(r.average_rating || 0),
      median_reply_seconds:
        r.median_reply_seconds === null || typeof r.median_reply_seconds === "undefined"
          ? null
          : Number(r.median_reply_seconds)
    }
  });
}));

// Public: requester profile (public-safe; shown before chat)
app.get("/v1/public/requesters/:id", wrap(async (req, res) => {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ message: "Invalid requester id" });

  const requesterId = parsed.data.id;

  const row = await pool.query(
    `
    SELECT
      u.id,
      (u.email_verified_at IS NOT NULL) AS email_verified,
      (u.phone_verified_at IS NOT NULL) AS phone_verified,
      u.verification_status,
      COALESCE(NULLIF(up.display_name, ''), split_part(COALESCE(up.full_name, ''), ' ', 1)) AS display_name,
      up.avatar_url,
      up.public_location AS public_location,
      up.bio,
      up.languages,
      up.interaction_styles,
      up.availability_windows,

      up.need_categories,
      up.need_help_prompt,

      up.parking_available,
      up.elevator_available,
      up.stairs_present,
      up.pickup_vs_dropoff,
      up.time_flexibility,

      up.pets_at_home,
      up.smoke_free,
      up.accessibility_needs,

      up.meet_in_public_first,
      up.someone_else_present,
      up.mask_preferred,

      u.created_at,
      up.updated_at AS profile_updated_at,
      COALESCE(ups.public_profile_visible, TRUE) AS public_profile_visible,

      COALESCE((SELECT COUNT(*)::int FROM service_requests sr WHERE sr.requester_user_id = u.id), 0) AS requests_count,
      COALESCE((SELECT COUNT(*)::int
        FROM request_commitments c
        JOIN service_requests sr ON sr.id = c.request_id
        WHERE sr.requester_user_id = u.id
      ), 0) AS commitments_total_count,
      COALESCE((SELECT COUNT(*)::int
        FROM request_commitments c
        JOIN service_requests sr ON sr.id = c.request_id
        WHERE sr.requester_user_id = u.id AND c.status = 'completed'
      ), 0) AS completed_count,
      COALESCE((SELECT COUNT(*)::int
        FROM request_commitments c
        JOIN service_requests sr ON sr.id = c.request_id
        WHERE sr.requester_user_id = u.id AND c.status = 'canceled'
      ), 0) AS canceled_count,

      COALESCE((SELECT COUNT(*)::int FROM volunteer_reviews vr WHERE vr.reviewer_user_id = u.id), 0) AS thank_you_notes_count,
      COALESCE((SELECT COUNT(*)::int FROM volunteer_reviews vr WHERE vr.reviewer_user_id = u.id AND vr.would_work_again = TRUE), 0) AS endorsements_given_count,

      (
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)
        FROM (
          SELECT EXTRACT(EPOCH FROM (reply.created_at - msg.created_at))::float AS seconds
          FROM direct_messages msg
          JOIN LATERAL (
            SELECT created_at
            FROM direct_messages reply
            WHERE reply.sender_user_id = u.id
              AND reply.recipient_user_id = msg.sender_user_id
              AND reply.created_at > msg.created_at
            ORDER BY reply.created_at ASC
            LIMIT 1
          ) reply ON TRUE
          WHERE msg.recipient_user_id = u.id
            AND msg.sender_user_id <> u.id
            AND msg.created_at >= NOW() - INTERVAL '90 days'
            AND reply.created_at <= msg.created_at + INTERVAL '7 days'
        ) deltas
      ) AS median_reply_seconds
    FROM users u
      LEFT JOIN user_profiles up ON up.user_id = u.id
      LEFT JOIN user_privacy_settings ups ON ups.user_id = u.id
    WHERE u.id = $1 AND u.role = 'requester'
    `,
    [requesterId]
  );

  if (row.rowCount === 0) return res.status(404).json({ message: "Requester not found" });

  const r: any = row.rows[0];

  const viewer = await optionalAuthedUser(req);
  const viewerId = viewer ? String((viewer as any).id || "") : "";
  const isAdmin = !!(viewer && (viewer as any).is_platform_admin);
  const visible = !!r.public_profile_visible;
  const canView = visible || viewerId === requesterId || isAdmin;
  if (!canView) return res.status(404).json({ message: "Requester not found" });

  const commitmentsTotal = Number(r.commitments_total_count || 0);
  const canceled = Number(r.canceled_count || 0);
  const cancellation_rate = commitmentsTotal > 0 ? canceled / commitmentsTotal : null;


  const reviewsAgg = await pool.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count
     FROM requester_reviews
     WHERE requester_user_id = $1`,
    [requesterId]
  );

  const recentReviews = await pool.query(
    `
    SELECT
      rr.id,
      rr.rating,
      rr.strengths,
      rr.improvements,
      rr.would_work_again,
      rr.created_at,
      rr.request_id,
      r.title AS request_title,
      COALESCE(p.display_name, p.full_name, u.email, 'Unknown') AS reviewer_name
    FROM requester_reviews rr
    LEFT JOIN service_requests r ON r.id = rr.request_id
    LEFT JOIN users u ON u.id = rr.reviewer_user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE rr.requester_user_id = $1
    ORDER BY rr.created_at DESC
    LIMIT 3
    `,
    [requesterId]
  );

  const reviews_as_requester = {
    average_rating: Number(reviewsAgg.rows[0]?.avg_rating || 0),
    count: Number(reviewsAgg.rows[0]?.count || 0),
    recent: illustrateRows(recentReviews.rows)
  };

  return res.json({
    id: r.id,
    display_name: r.display_name || null,
    avatar_url: r.avatar_url || null,
    public_location: r.public_location || null,
    bio: r.bio || null,
    languages: r.languages || [],
    interaction_tags: r.interaction_styles || [],
    availability_windows: r.availability_windows || [],
    need_categories: r.need_categories || [],
    need_help_prompt: r.need_help_prompt || null,
    reviews_as_requester,

    logistics: {
      parking_available: typeof r.parking_available === "boolean" ? r.parking_available : null,
      elevator_available: typeof r.elevator_available === "boolean" ? r.elevator_available : null,
      stairs_present: typeof r.stairs_present === "boolean" ? r.stairs_present : null,
      pickup_vs_dropoff: r.pickup_vs_dropoff || null,
      time_flexibility: r.time_flexibility || null
    },
    household: {
      pets_at_home: typeof r.pets_at_home === "boolean" ? r.pets_at_home : null,
      smoke_free: typeof r.smoke_free === "boolean" ? r.smoke_free : null,
      accessibility_needs: r.accessibility_needs || null
    },
    safety_preferences: {
      meet_in_public_first: typeof r.meet_in_public_first === "boolean" ? r.meet_in_public_first : null,
      someone_else_present: typeof r.someone_else_present === "boolean" ? r.someone_else_present : null,
      mask_preferred: typeof r.mask_preferred === "boolean" ? r.mask_preferred : null
    },
    verification: {
      email_verified: !!r.email_verified,
      phone_verified: !!r.phone_verified,
      id_verification_status: r.verification_status || null
    },
    created_at: r.created_at,
    profile_updated_at: r.profile_updated_at || null,
    stats: {
      requests_count: Number(r.requests_count || 0),
      completed_commitments_count: Number(r.completed_count || 0),
      canceled_count: Number(r.canceled_count || 0),
      cancellation_rate,
      typical_response_time_seconds:
        r.median_reply_seconds === null || typeof r.median_reply_seconds === "undefined"
          ? null
          : Number(r.median_reply_seconds),
      thank_you_notes_count: Number(r.thank_you_notes_count || 0),
      endorsements_given_count: Number(r.endorsements_given_count || 0)
    }
  });
}));


// Contact form (still validation-only)
const ShareTypeSchema = z.enum(["PUBLIC_PAGE", "IMPACT_STORY", "ORGANIZATION", "OPPORTUNITY", "SERVICE_REQUEST", "VOLUNTEER_PROFILE", "INVITE"]);
const ShareVisibilitySchema = z.enum(["public", "link_only", "logged_in_only", "private"]);


const SHARE_REPORTS_AUTO_REVOKE_THRESHOLD = 3;
const SHARE_REPORTS_RESTRICT_30D_THRESHOLD = 5;

async function getShareModerationSummaryForUser(userId: string) {
  const res = await pool.query(
    `
      WITH links AS (
        SELECT id, revoked_at
        FROM share_links
        WHERE created_by_user_id = $1
      ),
      counts AS (
        SELECT
          l.id,
          l.revoked_at,
          COUNT(r.id) FILTER (WHERE r.id IS NOT NULL) AS report_count,
          COUNT(r.id) FILTER (WHERE r.created_at >= NOW() - INTERVAL '30 days') AS reports_last_30d_for_link,
          MAX(r.created_at) AS last_reported_at
        FROM links l
        LEFT JOIN share_reports r ON r.share_link_id = l.id
        GROUP BY l.id, l.revoked_at
      )
      SELECT
        COUNT(*) FILTER (WHERE report_count > 0) AS reported_links,
        COUNT(*) FILTER (WHERE revoked_at IS NOT NULL AND report_count >= $2) AS auto_revoked_links,
        COALESCE(SUM(reports_last_30d_for_link), 0) AS reports_last_30d,
        MAX(last_reported_at) AS last_reported_at
      FROM counts
    `,
    [userId, SHARE_REPORTS_AUTO_REVOKE_THRESHOLD]
  );

  const row = (res.rows[0] || {}) as any;
  const reportedLinks = Number(row.reported_links || 0);
  const autoRevokedLinks = Number(row.auto_revoked_links || 0);
  const reportsLast30d = Number(row.reports_last_30d || 0);
  const lastReportedAt = row.last_reported_at ? new Date(row.last_reported_at).toISOString() : null;

  const shareCreationRestricted = reportsLast30d >= SHARE_REPORTS_RESTRICT_30D_THRESHOLD;

  return {
    reported_links: reportedLinks,
    auto_revoked_links: autoRevokedLinks,
    reports_last_30d: reportsLast30d,
    last_reported_at: lastReportedAt,
    share_creation_restricted: shareCreationRestricted,
    thresholds: {
      auto_revoke_reports: SHARE_REPORTS_AUTO_REVOKE_THRESHOLD,
      restrict_reports_30d: SHARE_REPORTS_RESTRICT_30D_THRESHOLD
    }
  };
}



const createShareLinkHandler = async (req: express.Request, res: express.Response) => {
  const user = await requireAuthedUser(req, res);
  if (!user) return;

  const parsed = z
    .object({
      share_type: ShareTypeSchema,
      target_ref: z.string().min(1),
      visibility: ShareVisibilitySchema.optional(),
      expires_in_days: z.number().int().positive().max(365).optional()
    })
    .safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload" });
  }

  const shareType = parsed.data.share_type;
  const targetRef = String(parsed.data.target_ref).trim();
  const visibility = normalizeVisibility(parsed.data.visibility);
  const expiresInDays = parsed.data.expires_in_days;

  // Ownership/permission checks per share type (privacy & safety)
  if (shareType === "ORGANIZATION") {
    const ok = (user as any).is_platform_admin || (await isActiveOrgMember(user.id, targetRef));
    if (!ok) return res.status(403).json({ message: "Forbidden" });
  }

  if (shareType === "OPPORTUNITY") {
    const oppId = Number(targetRef);
    if (!Number.isInteger(oppId) || oppId <= 0) return res.status(400).json({ message: "Invalid target_ref" });

    const rows = await pool.query(`SELECT organization_slug FROM opportunities WHERE id = $1`, [oppId]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    const orgSlug = rows.rows[0]?.organization_slug as string | null;
    const ok = (user as any).is_platform_admin || (orgSlug ? await isActiveOrgMember(user.id, orgSlug) : false);
    if (!ok) return res.status(403).json({ message: "Forbidden" });
  }

  if (shareType === "SERVICE_REQUEST") {
    const idParsed = z.string().uuid().safeParse(targetRef);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid target_ref" });

    const rows = await pool.query(
      `SELECT requester_user_id, requester_org_slug FROM service_requests WHERE id = $1`,
      [targetRef]
    );
    if (rows.rowCount === 0) return res.status(404).json({ message: "Request not found" });

    const row = rows.rows[0] as any;
    const isOwner = String(row.requester_user_id) === String(user.id);
    const orgSlug = row.requester_org_slug as string | null;
    const ok = (user as any).is_platform_admin || isOwner || (orgSlug ? await isActiveOrgMember(user.id, orgSlug) : false);
    if (!ok) return res.status(403).json({ message: "Forbidden" });
  }

  // Validate target exists and compute destination path
  let destinationPath = "/";
  if (shareType === "PUBLIC_PAGE") {
    const rows = await pool.query(`SELECT slug FROM public_pages WHERE slug = $1`, [targetRef]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Page not found" });
    destinationPath = targetRef === "home" ? "/" : `/${targetRef}`;
  } else if (shareType === "IMPACT_STORY") {
    const rows = await pool.query(`SELECT slug FROM impact_stories WHERE slug = $1`, [targetRef]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Story not found" });
    destinationPath = `/impact-stories/${encodeURIComponent(targetRef)}`;
  } else if (shareType === "ORGANIZATION") {
    const rows = await pool.query(`SELECT slug FROM organizations WHERE slug = $1`, [targetRef]);
    if (rows.rowCount === 0) return res.status(404).json({ message: "Organization not found" });
    destinationPath = `/organizations/${encodeURIComponent(targetRef)}`;
  } else if (shareType === "OPPORTUNITY") {
    destinationPath = `/opportunities/${encodeURIComponent(targetRef)}`;
  } else if (shareType === "SERVICE_REQUEST") {
    const rows = await pool.query(`SELECT requester_org_slug FROM service_requests WHERE id = $1`, [targetRef]);
    const orgSlug = (rows.rows[0] as any)?.requester_org_slug as string | null;
    destinationPath = orgSlug ? `/org/requests/${encodeURIComponent(targetRef)}` : `/requester/requests/${encodeURIComponent(targetRef)}`;
  }

  const expiresAt =
    typeof expiresInDays === "number" ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() : null;

  // Dedupe: reuse an existing active share link for same user/type/target/visibility
  const existing = await pool.query(
    `
      SELECT token, destination_path, visibility, expires_at
      FROM share_links
      WHERE share_type = $1 AND target_ref = $2 AND created_by_user_id = $3
        AND visibility = $4
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [shareType, targetRef, user.id, visibility]
  );

  if ((existing.rowCount ?? 0) > 0) {
    const row = existing.rows[0] as any;
    return res.json({
      token: row.token,
      share_path: `/share/${row.token}`,
      destination_path: row.destination_path,
      visibility: row.visibility,
      expires_at: row.expires_at
    });
  }

  const token = randomToken();

  await pool.query(
    `
      INSERT INTO share_links (token, share_type, target_ref, destination_path, visibility, created_by_user_id, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [token, shareType, targetRef, destinationPath, visibility, user.id, expiresAt]
  );

  return res.json({
    token,
    share_path: `/share/${token}`,
    destination_path: destinationPath,
    visibility,
    expires_at: expiresAt
  });
};

app.post("/v1/shares", createShareLinkHandler);
app.post("/v1/share/links", createShareLinkHandler);


function coarseLocationFromText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Prefer the last 1-2 comma-separated segments (often "City, ST" or "Region, Country").
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  let candidate = parts.length >= 2 ? `${parts[parts.length - 2]}, ${parts[parts.length - 1]}` : parts[0];

  // If it looks like a street address (digits / common street tokens), fall back to the last segment.
  const looksStreety = /\d/.test(candidate) || /\b(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|dr|drive|apt|suite|unit)\b/i.test(candidate);
  if (looksStreety && parts.length >= 1) {
    candidate = parts[parts.length - 1];
  }

  candidate = candidate.replace(/\s+/g, " ").trim();
  if (!candidate) return null;

  // Safety: cap length.
  if (candidate.length > 80) candidate = candidate.slice(0, 80).trim();

  return candidate;
}

function buildLoginCtaHref(token: string) {
  return `/login?returnTo=${encodeURIComponent("/s/" + token)}`;
}

app.get("/v1/shares/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Missing token" });

  const linkRes = await pool.query(
    `
      SELECT id, token, share_type, target_ref, destination_path, visibility, expires_at, revoked_at, created_by_user_id
      FROM share_links
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const link = linkRes.rows[0] as any;

  const isExpired = Boolean(link.expires_at) && new Date(link.expires_at).getTime() <= Date.now();
  const isRevoked = Boolean(link.revoked_at);

  // If private: only creator (or admin) can view anything (even preview).
  const visibility = String(link.visibility || "public");
  const shareType = String(link.share_type || "");
  const targetRef = String(link.target_ref || "");

  const user = await getOptionalAuthedUser(req);

  if (visibility === "private") {
    const isOwner = Boolean(user) && String((user as any).id) === String(link.created_by_user_id);
    const isAdmin = Boolean(user) && String((user as any).role || "") === "admin";
    if (!isOwner && !isAdmin) {
      // Don't disclose existence for private shares.
      return res.status(404).json({ message: "Not found" });
    }
  }

  const requiresAuthByType =
    shareType === "ORGANIZATION" || shareType === "OPPORTUNITY" || shareType === "SERVICE_REQUEST";

  const requiresLogin =
    visibility === "logged_in_only" || visibility === "private" || requiresAuthByType;

  const viewerCanViewDetails =
    !isExpired &&
    !isRevoked &&
    (visibility === "public" || visibility === "link_only" || (visibility === "logged_in_only" && Boolean(user)) || visibility === "private");

  // Minimal response when not allowed (safe for OG + crawlers)
  if (!viewerCanViewDetails) {
    const title = isExpired ? "Link expired" : isRevoked ? "Link revoked" : "ThankYou shared link";
    const summary = isExpired
      ? "This shared link has expired."
      : isRevoked
        ? "This shared link has been revoked."
        : "Sign in to view details.";

    return res.json({
      token: link.token,
      title,
      summary,
      cta_label: "Log in to view",
      cta_href: buildLoginCtaHref(link.token),
      coarse_location: null,
      time_window: null,
      verification_status: null,
      image_url: null,
      requires_login: true,
      is_expired: isExpired,
      is_revoked: isRevoked,
      viewer_can_view_details: false
    });
  }

  let title = "Shared link";
  let summary = "";
  let coarseLocation: string | null = null;
  let timeWindow: any = null;
  let verificationStatus: string | null = null;
  let imageUrl: string | null = null;
  let ctaLabel = "Open";
  const ctaHref = `/s/${encodeURIComponent(link.token)}`;

  try {
    if (shareType === "PUBLIC_PAGE") {
      const rowRes = await pool.query(`SELECT title, body FROM public_pages WHERE slug = $1`, [targetRef]);
      const row = rowRes.rows[0] as any;
      title = String(row?.title || "Public page");
      const body = String(row?.body || "");
      summary = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
      ctaLabel = "Open page";
    } else if (shareType === "IMPACT_STORY") {
      const rowRes = await pool.query(
        `SELECT title, excerpt, cover_image_url FROM impact_stories WHERE slug = $1`,
        [targetRef]
      );
      const row = rowRes.rows[0] as any;
      title = String(row?.title || "Impact story");
      summary = String(row?.excerpt || "").slice(0, 180);
      imageUrl = row?.cover_image_url ? String(row.cover_image_url) : null;
      ctaLabel = "Read story";
    } else if (shareType === "ORGANIZATION") {
      const rowRes = await pool.query(
        `SELECT name, summary, location, verification_status, verified_at FROM organizations WHERE slug = $1`,
        [targetRef]
      );
      const row = rowRes.rows[0] as any;
      title = String(row?.name || "Organization");
      summary = String(row?.summary || "").slice(0, 180);
      coarseLocation = String(row?.location || "");
      const status = row?.verification_status ? String(row.verification_status) : null;
      const verifiedAt = row?.verified_at ? String(row.verified_at) : null;
      verificationStatus = verifiedAt ? "verified" : status;
      ctaLabel = "View organization";
    } else if (shareType === "SERVICE_REQUEST" || shareType === "OPPORTUNITY") {
      // Primary data source: service_requests (UUID ids). This is used for both volunteer opportunities and requester posts.
      const rowRes = await pool.query(
        `
          SELECT r.title, r.description, r.location_text, r.needed_by, r.requester_org_slug,
                 org.verification_status, org.verified_at, org.location AS org_location
          FROM service_requests r
          LEFT JOIN organizations org ON org.slug = r.requester_org_slug
          WHERE r.id = $1
          LIMIT 1
        `,
        [targetRef]
      );

      const row = rowRes.rows[0] as any;
      title = String(row?.title || "Service request");
      summary = String(row?.description || "").replace(/\s+/g, " ").trim().slice(0, 180);

      // Coarse location: prefer org location if present; otherwise sanitize free-form location_text.
      coarseLocation = row?.org_location ? String(row.org_location) : coarseLocationFromText(row?.location_text);

      if (row?.needed_by) {
        timeWindow = { needed_by: String(row.needed_by) };
      }

      const status = row?.verification_status ? String(row.verification_status) : null;
      const verifiedAt = row?.verified_at ? String(row.verified_at) : null;
      verificationStatus = verifiedAt ? "verified" : status;

      ctaLabel = "Volunteer / Apply";
    } else {
      // Fallback
      title = "Shared link";
      summary = "";
      ctaLabel = "Open";
    }
  } catch {
    // Swallow preview errors; fall back to generic.
  }

  return res.json({
    token: link.token,
    title,
    summary,
    cta_label: ctaLabel,
    cta_href: ctaHref,
    coarse_location: coarseLocation,
    time_window: timeWindow,
    verification_status: verificationStatus,
    image_url: imageUrl,
    requires_login: requiresLogin,
    is_expired: isExpired,
    is_revoked: isRevoked,
    viewer_can_view_details: true
  });
});

app.post("/v1/shares/:token/events", async (req, res) => {
  const token = String(req.params.token || "").trim();
  const parsed = z
    .object({
      event_type: z.enum(["view","copy","sms","email","whatsapp","facebook","x","linkedin","qr","native_share","resolve"])
    })
    .safeParse(req.body);

  if (!token) return res.status(400).json({ message: "Missing token" });
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const linkRes = await pool.query(`SELECT id, created_by_user_id, revoked_at FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = (linkRes.rows[0] as any).id;

  const user = await getOptionalAuthedUser(req);
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");

  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [linkId, parsed.data.event_type, user ? (user as any).id : null, ipHashVal, userAgent || null, referer || null]
  );

  return res.json({ ok: true });
});

app.post("/v1/shares/:token/report", async (req, res) => {
  const token = String(req.params.token || "").trim();

  const parsed = z
    .object({
      reason: z.string().min(1).max(100),
      details: z.string().max(2000).optional()
    })
    .safeParse(req.body);

  if (!token) return res.status(400).json({ message: "Missing token" });
  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const linkRes = await pool.query(`SELECT id FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = (linkRes.rows[0] as any).id;
  const linkRevokedAt = (linkRes.rows[0] as any).revoked_at as string | null;
  const user = await getOptionalAuthedUser(req);

  await pool.query(
    `
      INSERT INTO share_reports (share_link_id, reason, details, reporter_user_id)
      VALUES ($1, $2, $3, $4)
    `,
    [linkId, parsed.data.reason, parsed.data.details || null, user ? (user as any).id : null]
  );

  // Policy: auto-revoke a link after N reports
  const countRes = await pool.query(`SELECT COUNT(*)::int AS c FROM share_reports WHERE share_link_id = $1`, [linkId]);
  const reportCount = Number((countRes.rows[0] as any)?.c || 0);
  if (!linkRevokedAt && reportCount >= SHARE_REPORTS_AUTO_REVOKE_THRESHOLD) {
    await pool.query(`UPDATE share_links SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL`, [linkId]);
  }

  return res.json({ ok: true });
});

app.post("/v1/shares/:token/revoke", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Missing token" });

  const user = await requireAuthedUser(req, res);
  if (!user) return;

  const linkRes = await pool.query(
    `SELECT id, created_by_user_id FROM share_links WHERE token = $1 LIMIT 1`,
    [token]
  );

  if (linkRes.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const row = linkRes.rows[0] as any;
  const isOwner = String(row.created_by_user_id) === String(user.id);
  const isAdmin = String((user as any).role || "") === "admin";

  if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });

  await pool.query(`UPDATE share_links SET revoked_at = NOW() WHERE id = $1`, [row.id]);
  return res.json({ ok: true });
});


app.get("/v1/share/resolve/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Invalid token" });

  const rows = await pool.query(
    `
      SELECT id, token, share_type, target_ref, destination_path, visibility, created_by_user_id, expires_at, revoked_at
      FROM share_links
      WHERE token = $1
      LIMIT 1
    `,
    [token]
  );

  if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const link = rows.rows[0] as any;
  if (link.revoked_at) return res.status(404).json({ message: "Not found" });
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return res.status(404).json({ message: "Not found" });

  const shareType = String(link.share_type);
  const visibility = String(link.visibility);
  const needsAuth = requiresAuthByType(shareType) || visibility === "logged_in_only" || visibility === "private";

  const user = await getOptionalAuthedUser(req);

  if (needsAuth && !user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  if (visibility === "private") {
    const isOwner = user && String((user as any).id) === String(link.created_by_user_id);
    const isAdmin = user && Boolean((user as any).is_platform_admin);
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "Forbidden" });
  }

  // Log resolve event (privacy-preserving)
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");
  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, 'resolve', $2, $3, $4, $5)
    `,
    [link.id, user ? (user as any).id : null, ipHashVal, userAgent || null, referer || null]
  );

  await pool.query(
    `
      UPDATE share_links
      SET resolve_count = resolve_count + 1, last_resolved_at = NOW()
      WHERE id = $1
    `,
    [link.id]
  );

  return res.json({
    destination_path: link.destination_path,
    requires_auth: needsAuth,
    visibility: link.visibility,
    share_type: link.share_type,
    target_ref: link.target_ref
  });
});

app.post("/v1/share/events", async (req, res) => {
  const parsed = z
    .object({
      token: z.string().min(1),
      event_type: z.enum(["view","copy","sms","email","whatsapp","facebook","x","linkedin","qr","native_share","resolve"])
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const token = String(parsed.data.token).trim();
  const rows = await pool.query(`SELECT id FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = rows.rows[0].id;
  const user = await getOptionalAuthedUser(req);
  const ipHashVal = hashIp(req);
  const userAgent = String(req.headers["user-agent"] || "");
  const referer = String(req.headers["referer"] || "");

  await pool.query(
    `
      INSERT INTO share_events (share_link_id, event_type, actor_user_id, ip_hash, user_agent, referer)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [linkId, parsed.data.event_type, user ? (user as any).id : null, ipHashVal, userAgent || null, referer || null]
  );

  return res.json({ ok: true });
});

app.post("/v1/share/report/:token", async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token) return res.status(400).json({ message: "Invalid token" });

  const parsed = z
    .object({
      reason: z.string().min(1).max(200),
      details: z.string().max(2000).optional()
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ message: "Invalid payload" });

  const rows = await pool.query(`SELECT id FROM share_links WHERE token = $1 LIMIT 1`, [token]);
  if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });

  const linkId = rows.rows[0].id;
  const user = await getOptionalAuthedUser(req);

  await pool.query(
    `
      INSERT INTO share_reports (share_link_id, reporter_user_id, reason, details)
      VALUES ($1, $2, $3, $4)
    `,
    [linkId, user ? (user as any).id : null, parsed.data.reason, parsed.data.details || null]
  );

  return res.json({ ok: true });
});

app.post("/v1/public/contact", async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    message: z.string().min(1)
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }
  return res.status(202).json({ status: "accepted" });
});

// Auth
app.post("/v1/auth/signup", wrap((req, res) => signup(pool, req, res)));
app.post("/v1/auth/login", wrap((req, res) => login(pool, req, res)));
app.get("/v1/auth/verify-email", wrap((req, res) => verifyEmail(pool, req, res)));
app.post("/v1/auth/resend-verification", wrap((req, res) => resendVerification(pool, req, res)));
app.post("/v1/auth/forgot-password", wrap((req, res) => forgotPassword(pool, req, res)));
app.post("/v1/auth/reset-password", wrap((req, res) => resetPassword(pool, req, res)));
app.post("/v1/auth/logout", wrap((req, res) => logout(pool, req, res)));

// Current user
app.get("/v1/me", wrap((req, res) => me(pool, req, res)));


app.get("/v1/me/moderation", async (req, res) => {
  const user = await requireAuthedUser(req, res);
  if (!user) return;
  const summary = await getShareModerationSummaryForUser(String((user as any).id));
  return res.json(summary);
});



// Onboarding
// Fetch current (possibly incomplete) profile for onboarding forms.
app.get(
  "/v1/onboarding/profile",
  wrap(async (req, res) => {
    const token = authHeaderToken(req);
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    const user = await requireUserBySession(pool, token);
    if (!user) return res.status(401).json({ message: "Not authenticated" });

    const prof = await pool.query(
      "SELECT full_name, display_name, avatar_url, phone, public_location, location, bio, languages, interaction_styles, availability_windows, help_categories, has_car, can_lift_heavy, stairs_ok, pet_friendly, service_radius_miles, experience, experience_tags, need_categories, need_help_prompt, parking_available, elevator_available, stairs_present, pickup_vs_dropoff, time_flexibility, pets_at_home, smoke_free, accessibility_needs, meet_in_public_first, someone_else_present, mask_preferred, updated_at FROM user_profiles WHERE user_id = $1",
      [user.id]
    );

    return res.json({ profile: prof.rows[0] || null });
  })
);

app.post("/v1/onboarding/role", wrap((req, res) => setRole(pool, req, res)));
app.post("/v1/onboarding/requester-mode", wrap((req, res) => setRequesterMode(pool, req, res)));
app.post("/v1/onboarding/profile", wrap((req, res) => setProfile(pool, req, res)));
app.post("/v1/onboarding/availability", wrap((req, res) => setAvailability(pool, req, res)));
app.post("/v1/onboarding/availability/skip", wrap((req, res) => skipAvailability(pool, req, res)));
app.post(
  "/v1/onboarding/verification",
  verificationUploadMiddleware,
  wrap((req, res) => submitVerification(pool, req, res))
);


// Requester area: home scaffold + access control (Step 4.1)
app.get(
  "/v1/requester/home",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const statsRes = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM organizations) AS organizations,
         (SELECT COUNT(*)::int FROM service_requests WHERE status = 'open') AS opportunities,
         (SELECT COUNT(*)::int FROM public_pages) AS publicPages`
    );

    const howRes = await pool.query(
      "SELECT slug, title, body, updated_at FROM public_pages WHERE slug = $1",
      ["how-it-works"]
    );

    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      counts: statsRes.rows[0] || { organizations: 0, opportunities: 0, publicPages: 0 },
      howItWorks: howRes.rows[0] || null
    });
  })
);

// Requester area: dashboard summary (Step 4.2)
app.get(
  "/v1/requester/dashboard",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const [activeRequestsRes, pendingApplicationsRes, upcomingRes, unreadThreadsRes] = await Promise.all([
      pool.query(
        "SELECT COUNT(*)::int AS c FROM service_requests WHERE requester_user_id = $1 AND status IN ('open','paused')",
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
           FROM request_applications a
           JOIN service_requests r ON r.id = a.request_id
          WHERE r.requester_user_id = $1 AND a.status = 'pending'`,
        [user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
           FROM request_commitments c
           JOIN service_requests r ON r.id = c.request_id
          WHERE r.requester_user_id = $1
            AND c.status IN ('scheduled','confirmed')
            AND c.start_at > NOW()`,
        [user.id]
      ),
      pool.query(
        "SELECT COUNT(DISTINCT sender_user_id)::int AS c FROM direct_messages WHERE recipient_user_id = $1 AND read_at IS NULL",
        [user.id]
      )
    ]);

    return res.json({
      activeRequests: activeRequestsRes.rows[0]?.c ?? 0,
      pendingApplications: pendingApplicationsRes.rows[0]?.c ?? 0,
      upcoming: upcomingRes.rows[0]?.c ?? 0,
      unreadThreads: unreadThreadsRes.rows[0]?.c ?? 0
    });
  })
);


// Requester area: quick access activity (new applications + recent messages)
app.get(
  "/v1/requester/activity",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const recentApplicationsRes = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.request_id,
        r.title AS request_title,
        a.status,
        a.message,
        a.created_at,
        a.volunteer_user_id,
        u.email AS volunteer_email,
        COALESCE(p.display_name, p.full_name, u.email) AS volunteer_display_name,
        p.avatar_url AS volunteer_avatar_url,
        COALESCE(p.public_location, p.location) AS volunteer_public_location
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      JOIN users u ON u.id = a.volunteer_user_id
      LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE r.requester_user_id = $1
        AND a.status IN ('pending','waitlisted')
      ORDER BY a.created_at DESC
      LIMIT 5
      `,
      [user.id]
    );

    const recentThreadsRes = await pool.query(
      `
      WITH msgs AS (
        SELECT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id,
          sender_user_id,
          recipient_user_id,
          request_id,
          application_id,
          body,
          created_at,
          read_at
        FROM direct_messages
        WHERE sender_user_id = $1 OR recipient_user_id = $1
      ),
      agg AS (
        SELECT
          peer_id,
          request_id,
          application_id,
          MAX(created_at) AS last_at,
          COUNT(*) FILTER (WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread_count
        FROM msgs
        GROUP BY peer_id, request_id, application_id
      ),
      last_msg AS (
        SELECT DISTINCT ON (peer_id, request_id, application_id)
          peer_id,
          request_id,
          application_id,
          body AS last_body,
          created_at AS last_at
        FROM msgs
        ORDER BY peer_id, request_id, application_id, created_at DESC
      )
      SELECT
        a.peer_id,
        a.request_id,
        a.application_id,
        r.title AS request_title,
        u.email AS peer_email,
        COALESCE(p.display_name, p.full_name, u.email) AS peer_display_name,
        p.avatar_url AS peer_avatar_url,
        COALESCE(p.public_location, p.location) AS peer_public_location,
        l.last_body,
        l.last_at,
        a.unread_count::int AS unread_count
      FROM agg a
      JOIN last_msg l ON l.peer_id = a.peer_id
        AND l.request_id IS NOT DISTINCT FROM a.request_id
        AND l.application_id IS NOT DISTINCT FROM a.application_id
      JOIN users u ON u.id = a.peer_id
      LEFT JOIN user_profiles p ON p.user_id = a.peer_id
      LEFT JOIN service_requests r ON r.id = a.request_id
      ORDER BY l.last_at DESC
      LIMIT 5
      `,
      [user.id]
    );

    return res.json({
      recentApplications: recentApplicationsRes.rows,
      recentThreads: recentThreadsRes.rows
    });
  })
);

// Requester area: pending applications across all requests
app.get(
  "/v1/requester/applications/pending",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.request_id,
        r.title AS request_title,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        a.volunteer_user_id,
        u.email AS volunteer_email,
        COALESCE(p.display_name, p.full_name, u.email) AS volunteer_display_name,
        p.avatar_url AS volunteer_avatar_url,
        COALESCE(p.public_location, p.location) AS volunteer_public_location,
        p.bio AS volunteer_bio,
        u.verification_status AS volunteer_verification_status
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      JOIN users u ON u.id = a.volunteer_user_id
      LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE r.requester_user_id = $1
        AND a.status IN ('pending','waitlisted')
      ORDER BY a.created_at DESC
      LIMIT 100
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

// Requester area: messages inbox + thread (mirrors volunteer messaging)
app.get(
  "/v1/requester/messages/inbox",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      WITH msgs AS (
        SELECT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id,
          sender_user_id,
          recipient_user_id,
          request_id,
          application_id,
          body,
          created_at,
          read_at
        FROM direct_messages
        WHERE sender_user_id = $1 OR recipient_user_id = $1
      ),
      agg AS (
        SELECT
          peer_id,
          request_id,
          application_id,
          MAX(created_at) AS last_at,
          COUNT(*) FILTER (WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread_count
        FROM msgs
        WHERE NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = peer_id)
             OR (b.blocker_user_id = peer_id AND b.blocked_user_id = $1)
        )
        GROUP BY peer_id, request_id, application_id
      ),
      last_msg AS (
        SELECT DISTINCT ON (peer_id, request_id, application_id)
          peer_id,
          request_id,
          application_id,
          body AS last_body,
          created_at AS last_at
        FROM msgs
        ORDER BY peer_id, request_id, application_id, created_at DESC
      )
      SELECT
        a.peer_id,
        a.request_id,
        a.application_id,
        r.title AS request_title,
        u.email AS peer_email,
        COALESCE(p.display_name, p.full_name, u.email) AS peer_display_name,
        p.avatar_url AS peer_avatar_url,
        COALESCE(p.public_location, p.location) AS peer_public_location,
        l.last_body,
        l.last_at,
        a.unread_count::int AS unread_count
      FROM agg a
      JOIN last_msg l ON l.peer_id = a.peer_id
        AND l.request_id IS NOT DISTINCT FROM a.request_id
        AND l.application_id IS NOT DISTINCT FROM a.application_id
      JOIN users u ON u.id = a.peer_id
      LEFT JOIN user_profiles p ON p.user_id = a.peer_id
      LEFT JOIN service_requests r ON r.id = a.request_id
      ORDER BY l.last_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);


app.get(
  "/v1/requester/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const peerIdParsed = z.string().uuid().safeParse(req.params.peerId);
    if (!peerIdParsed.success) return res.status(400).json({ message: "Invalid peer id" });
    const peerId = peerIdParsed.data;

    if (await isBlockedBetween(user.id, peerId)) {
      return res
        .status(403)
        .json({ message: "This conversation is unavailable because one of you has blocked the other." });
    }

    if (peerId === user.id) return res.status(400).json({ message: "Invalid peer id" });

    const ctxSchema = z.object({
      requestId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional()
    });

    const ctxParsed = ctxSchema.safeParse({
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined
    });

    if (!ctxParsed.success) return res.status(400).json({ message: "Invalid context params" });

    let requestId: string | null = ctxParsed.data.requestId ?? null;
    const applicationId: string | null = ctxParsed.data.applicationId ?? null;

    let context: any = null;

    if (applicationId) {
      const a = await pool.query(
        `
        SELECT
          a.id,
          a.request_id,
          a.volunteer_user_id,
          r.title AS request_title
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });

      const row = a.rows[0];
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      const owner = await pool.query("SELECT requester_user_id FROM service_requests WHERE id = $1", [row.request_id]);
      if (owner.rowCount === 0 || String(owner.rows[0].requester_user_id) !== user.id) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }

      context = {
        request_id: String(row.request_id),
        request_title: row.request_title,
        application_id: applicationId
      };
    }

    if (requestId && !context) {
      const r = await pool.query("SELECT id, title FROM service_requests WHERE id = $1 AND requester_user_id = $2", [
        requestId,
        user.id
      ]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const ok = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (ok.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }

      context = {
        request_id: String(r.rows[0].id),
        request_title: r.rows[0].title,
        application_id: applicationId
      };
    }

    // Mark unread messages from peer as read (context-scoped)
    await pool.query(
      `
      UPDATE direct_messages
      SET read_at = NOW()
      WHERE sender_user_id = $1 AND recipient_user_id = $2 AND read_at IS NULL
        AND request_id IS NOT DISTINCT FROM $3::uuid
        AND application_id IS NOT DISTINCT FROM $4::uuid
      `,
      [peerId, user.id, requestId, applicationId]
    );

    const peerRes = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        COALESCE(p.display_name, p.full_name, u.email) AS display_name,
        p.avatar_url,
        COALESCE(p.public_location, p.location) AS public_location
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [peerId]
    );
    if (peerRes.rowCount === 0) return res.status(404).json({ message: "Peer not found" });

    const messagesRes = await pool.query(
      `
      SELECT
        id,
        sender_user_id,
        recipient_user_id,
        request_id,
        application_id,
        body,
        created_at,
        read_at
      FROM direct_messages
      WHERE (
        (sender_user_id = $1 AND recipient_user_id = $2)
        OR (sender_user_id = $2 AND recipient_user_id = $1)
      )
        AND request_id IS NOT DISTINCT FROM $3::uuid
        AND application_id IS NOT DISTINCT FROM $4::uuid
      ORDER BY created_at ASC
      `,
      [user.id, peerId, requestId, applicationId]
    );

    return res.json({
      peer: peerRes.rows[0],
      context,
      messages: messagesRes.rows
    });
  })
);



app.post(
  "/v1/requester/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const peerIdParsed = z.string().uuid().safeParse(req.params.peerId);
    if (!peerIdParsed.success) return res.status(400).json({ message: "Invalid peer id" });
    const peerId = peerIdParsed.data;

    if (await isBlockedBetween(user.id, peerId)) {
      return res
        .status(403)
        .json({ message: "This conversation is unavailable because one of you has blocked the other." });
    }

    if (peerId === user.id) return res.status(400).json({ message: "Invalid peer id" });

    const ctxSchema = z.object({
      requestId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional()
    });

    const ctxParsed = ctxSchema.safeParse({
      requestId: typeof req.query.requestId === "string" ? req.query.requestId : undefined,
      applicationId: typeof req.query.applicationId === "string" ? req.query.applicationId : undefined
    });

    if (!ctxParsed.success) return res.status(400).json({ message: "Invalid context params" });

    let requestId: string | null = ctxParsed.data.requestId ?? null;
    const applicationId: string | null = ctxParsed.data.applicationId ?? null;

    if (applicationId) {
      const a = await pool.query(
        `
        SELECT a.request_id, a.volunteer_user_id, r.requester_user_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.id = $1
        `,
        [applicationId]
      );
      if (a.rowCount === 0) return res.status(404).json({ message: "Application not found" });
      const row = a.rows[0];

      if (String(row.requester_user_id) !== user.id) {
        return res.status(403).json({ message: "You do not have access to this application." });
      }
      if (String(row.volunteer_user_id) !== peerId) {
        return res.status(403).json({ message: "Invalid application context for this peer." });
      }

      requestId = requestId ?? String(row.request_id);
      if (requestId !== String(row.request_id)) {
        return res.status(400).json({ message: "Context mismatch (application vs request)." });
      }
    }

    if (requestId) {
      const r = await pool.query("SELECT id FROM service_requests WHERE id = $1 AND requester_user_id = $2", [requestId, user.id]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Request not found" });

      const ok = await pool.query(
        "SELECT 1 FROM request_applications WHERE request_id = $1 AND volunteer_user_id = $2 LIMIT 1",
        [requestId, peerId]
      );
      if (ok.rowCount === 0) {
        return res.status(403).json({ message: "You can only message volunteers who applied to this request." });
      }
    }

    const schema = z.object({ body: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const peerRes = await pool.query("SELECT id FROM users WHERE id = $1", [peerId]);
    if (peerRes.rowCount === 0) return res.status(404).json({ message: "Peer not found" });

    const perm = await canSendDirectMessage(user, peerId);
    if (!perm.allowed) {
      return res.status(403).json({ message: perm.reason || "This user is not accepting direct messages." });
    }

    const insert = await pool.query(
      "INSERT INTO direct_messages (sender_user_id, recipient_user_id, request_id, application_id, body) VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at",
      [user.id, peerId, requestId, applicationId, parsed.data.body]
    );

    return res.status(201).json({ messageId: insert.rows[0]?.id, createdAt: insert.rows[0]?.created_at });
  })
);


// Requester area: profile (shared schema, requester-specific fields)
app.get(
  "/v1/requester/profile",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const prof = await pool.query(
      `SELECT
         full_name,
         display_name,
         avatar_url,
         phone,
         public_location,
         location,
         bio,
         languages,
         interaction_styles,
         availability_windows,

         need_categories,
         need_help_prompt,

         parking_available,
         elevator_available,
         stairs_present,
         pickup_vs_dropoff,
         time_flexibility,

         pets_at_home,
         smoke_free,
         accessibility_needs,

         meet_in_public_first,
         someone_else_present,
         mask_preferred,

         updated_at
       FROM user_profiles
       WHERE user_id = $1`,
      [user.id]
    );

    const statsRow = await pool.query(
      `
      SELECT
        COALESCE((SELECT COUNT(*)::int
          FROM request_commitments c
          JOIN service_requests sr ON sr.id = c.request_id
          WHERE sr.requester_user_id = $1
        ), 0) AS commitments_total_count,
        COALESCE((SELECT COUNT(*)::int
          FROM request_commitments c
          JOIN service_requests sr ON sr.id = c.request_id
          WHERE sr.requester_user_id = $1 AND c.status = 'completed'
        ), 0) AS completed_count,
        COALESCE((SELECT COUNT(*)::int
          FROM request_commitments c
          JOIN service_requests sr ON sr.id = c.request_id
          WHERE sr.requester_user_id = $1 AND c.status = 'canceled'
        ), 0) AS canceled_count,
        COALESCE((SELECT COUNT(*)::int FROM volunteer_reviews vr WHERE vr.reviewer_user_id = $1), 0) AS thank_you_notes_count,
        (
          SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)
          FROM (
            SELECT EXTRACT(EPOCH FROM (reply.created_at - msg.created_at))::float AS seconds
            FROM direct_messages msg
            JOIN LATERAL (
              SELECT created_at
              FROM direct_messages reply
              WHERE reply.sender_user_id = $1
                AND reply.recipient_user_id = msg.sender_user_id
                AND reply.created_at > msg.created_at
              ORDER BY reply.created_at ASC
              LIMIT 1
            ) reply ON TRUE
            WHERE msg.recipient_user_id = $1
              AND msg.sender_user_id <> $1
              AND msg.created_at >= NOW() - INTERVAL '90 days'
              AND reply.created_at <= msg.created_at + INTERVAL '7 days'
          ) deltas
        ) AS median_reply_seconds
      `,
      [user.id]
    );

    const r: any = statsRow.rows[0] || {};
    const commitmentsTotal = Number(r.commitments_total_count || 0);
    const canceled = Number(r.canceled_count || 0);
    const cancellation_rate = commitmentsTotal > 0 ? canceled / commitmentsTotal : null;

    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      verification: {
        email_verified: !!user.email_verified_at,
        phone_verified: !!(user as any).phone_verified_at,
        id_verification_status: user.verification_status || null
      },
      profile: prof.rows[0] || null,
      trust: {
        completed_commitments_count: Number(r.completed_count || 0),
        cancellation_rate,
        typical_response_time_seconds:
          r.median_reply_seconds === null || typeof r.median_reply_seconds === "undefined"
            ? null
            : Number(r.median_reply_seconds),
        thank_you_notes_count: Number(r.thank_you_notes_count || 0)
      }
    });
  })
);

app.post(
  "/v1/requester/profile",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    // Full name is required for requester profiles.
    const schema = z.object({ fullName: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Full name is required" });
    }

    // Reuse onboarding profile handler to persist profile fields.
    return setProfile(pool, req, res);
  })
);



// Requester area: my active requests list (Step 4.6)
app.get(
  "/v1/requester/requests/active",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        r.id,
        r.title,
        r.description,
        r.status,
        r.updated_at,
        COALESCE(apps.applicants, 0)::int AS applicants,
        COALESCE(confs.confirmed, 0)::int AS confirmed
      FROM service_requests r
      LEFT JOIN (
        SELECT request_id, COUNT(*)::int AS applicants
        FROM request_applications
        WHERE status IN ('pending','accepted')
        GROUP BY request_id
      ) apps ON apps.request_id = r.id
      LEFT JOIN (
        SELECT request_id, COUNT(*)::int AS confirmed
        FROM request_commitments
        WHERE status IN ('scheduled','confirmed')
        GROUP BY request_id
      ) confs ON confs.request_id = r.id
      WHERE r.requester_user_id = $1
        AND r.status IN ('open','paused')
      ORDER BY r.updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

// Requester area: service requests (Step 4.4 + Step 4.5)

type RequesterRequestRow = {
  id: string;
  title: string;
  summary: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string | null;
  needed_by: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

type RequesterRequestDetail = {
  id: string;
  requester_user_id: string;
  title: string;
  description: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string;
  needed_by: string | null;
  tags: string[] | null;
  requester_org_slug: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeTags(input: unknown): string[] {
  const raw = String(input || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 25);
}

function parseOptionalDate(input: unknown): string | null {
  if (input === null || input === undefined) return null;
  const raw = String(input || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

app.get(
  "/v1/requester/requests",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        id,
        title,
        LEFT(description, 240) AS summary,
        status,
        COALESCE(location_text, '') AS location,
        COALESCE(mode, 'remote') AS mode,
        needed_by,
        tags,
        created_at,
        updated_at
      FROM service_requests
      WHERE requester_user_id = $1
      ORDER BY updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows as RequesterRequestRow[]);
  })
);

app.get(
  "/v1/requester/requests/:id",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        id,
        requester_user_id,
        title,
        description,
        status,
        COALESCE(location_text, '') AS location,
        COALESCE(mode, 'remote') AS mode,
        needed_by,
        tags,
        requester_org_slug,
        created_at,
        updated_at
      FROM service_requests
      WHERE id = $1 AND requester_user_id = $2
      `,
      [id, user.id]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Not found" });
    return res.json(rows.rows[0] as RequesterRequestDetail);
  })
);

app.post(
  "/v1/requester/requests",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(20000),
      status: z.enum(["open", "paused", "closed"]).optional().default("open"),
      locationText: z.string().trim().max(200).optional().nullable(),
      mode: z.enum(["in-person", "remote", "hybrid"]).optional().nullable(),
      neededBy: z.string().optional().nullable(),
      tags: z.string().optional().nullable(),
      requesterOrgSlug: z.string().trim().min(1).max(80).optional().nullable()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const neededByIso = parseOptionalDate(parsed.data.neededBy);
    if (parsed.data.neededBy && !neededByIso) {
      return res.status(400).json({ message: "Invalid neededBy date" });
    }

    const tags = parsed.data.tags ? normalizeTags(parsed.data.tags) : [];

    const insert = await pool.query(
      `
      INSERT INTO service_requests (
        requester_user_id,
        requester_org_slug,
        title,
        description,
        status,
        location_text,
        mode,
        needed_by,
        tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [
        user.id,
        parsed.data.requesterOrgSlug || null,
        parsed.data.title,
        parsed.data.description,
        parsed.data.status || "open",
        parsed.data.locationText || "",
        parsed.data.mode || "remote",
        neededByIso,
        tags.length ? tags : null
      ]
    );

    const requestId = insert.rows[0]?.id;

    // Best-effort geocode for in-person/hybrid requests (powers Nearby).
    if (requestId && String(parsed.data.mode || "remote") !== "remote" && String(parsed.data.locationText || "").trim()) {
      // Geocode in the background; never block the response on a third-party API.
      void ensureServiceRequestGeo(pool, String(requestId), String(parsed.data.locationText || "")).catch(() => null);
    }

    return res.status(201).json({ id: requestId });
  })
);

app.put(
  "/v1/requester/requests/:id",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const schema = z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(20000),
      status: z.enum(["open", "paused", "closed"]),
      locationText: z.string().trim().max(200).nullable(),
      mode: z.enum(["in-person", "remote", "hybrid"]).nullable(),
      neededBy: z.string().nullable(),
      tags: z.string().nullable()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const existing = await pool.query(
      "SELECT requester_org_slug FROM service_requests WHERE id = $1 AND requester_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Not found" });

    const neededByIso = parseOptionalDate(parsed.data.neededBy);
    if (parsed.data.neededBy && !neededByIso) {
      return res.status(400).json({ message: "Invalid neededBy date" });
    }

    const nextTags = parsed.data.tags ? normalizeTags(parsed.data.tags) : [];

    const update = await pool.query(
      `
      UPDATE service_requests
      SET
        title = $3,
        description = $4,
        status = $5,
        location_text = $6,
        mode = $7,
        needed_by = $8,
        tags = $9,
        updated_at = NOW()
      WHERE id = $1 AND requester_user_id = $2
      RETURNING
        id,
        requester_user_id,
        title,
        description,
        status,
        COALESCE(location_text, '') AS location,
        COALESCE(mode, 'remote') AS mode,
        needed_by,
        tags,
        requester_org_slug,
        created_at,
        updated_at
      `,
      [
        id,
        user.id,
        parsed.data.title,
        parsed.data.description,
        parsed.data.status,
        parsed.data.locationText || "",
        parsed.data.mode || "remote",
        neededByIso,
        nextTags.length ? nextTags : null
      ]
    );

    if (update.rowCount === 0) return res.status(404).json({ message: "Not found" });

    // Best-effort geocode for in-person/hybrid requests (powers Nearby).
    if (String(parsed.data.mode || "remote") !== "remote" && String(parsed.data.locationText || "").trim()) {
      void ensureServiceRequestGeo(pool, id, String(parsed.data.locationText || "")).catch(() => null);
    }

    return res.json(update.rows[0] as RequesterRequestDetail);
  })
);


// Requester area: request applications list + decisions (Step 4.7)

type RequesterApplicationRow = {
  id: string;
  request_id: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn" | "confirmed" | "completed" | string;
  message: string | null;
  created_at: string;
  updated_at: string;

  volunteer_user_id: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
  volunteer_bio: string | null;

  volunteer_verification_status: string | null;
};

app.get(
  "/v1/requester/requests/:id/applications",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid request id" });
    const requestId = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.request_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        a.volunteer_user_id,
        COALESCE(p.display_name, p.full_name) AS volunteer_display_name,
        p.avatar_url AS volunteer_avatar_url,
        COALESCE(p.public_location, p.location) AS volunteer_public_location,
        p.bio AS volunteer_bio,
        u.verification_status AS volunteer_verification_status
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      JOIN users u ON u.id = a.volunteer_user_id
      LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE a.request_id = $1
        AND r.requester_user_id = $2
      ORDER BY a.created_at DESC
      `,
      [requestId, user.id]
    );

    return res.json(rows.rows as RequesterApplicationRow[]);
  })
);

async function updateApplicationDecision(
  requesterUserId: string,
  applicationId: string,
  nextStatus: "accepted" | "rejected"
) {
  const existing = await pool.query(
    `
    SELECT a.id, a.status
    FROM request_applications a
    JOIN service_requests r ON r.id = a.request_id
    WHERE a.id = $1 AND r.requester_user_id = $2
    `,
    [applicationId, requesterUserId]
  );

  if (existing.rowCount === 0) {
    return { kind: "not_found" as const };
  }

  const currentStatus = String(existing.rows[0]?.status || "");
  if (currentStatus === nextStatus) {
    return { kind: "ok" as const, status: nextStatus };
  }

  if (currentStatus !== "pending" && currentStatus !== "waitlisted") {
    return { kind: "conflict" as const, status: currentStatus };
  }

  const updated = await pool.query(
    "UPDATE request_applications SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING id, status, updated_at",
    [applicationId, nextStatus]
  );

  return { kind: "ok" as const, status: String(updated.rows[0]?.status || nextStatus) };
}

app.post(
  "/v1/requester/applications/:id/accept",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const result = await updateApplicationDecision(user.id, applicationId, "accepted");
    if (result.kind === "not_found") return res.status(404).json({ message: "Application not found" });
    if (result.kind === "conflict") {
      return res.status(409).json({ message: `Cannot accept an application in status '${result.status}'` });
    }

    return res.status(200).json({ id: applicationId, status: result.status });
  })
);

app.post(
  "/v1/requester/applications/:id/reject",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const result = await updateApplicationDecision(user.id, applicationId, "rejected");
    if (result.kind === "not_found") return res.status(404).json({ message: "Application not found" });
    if (result.kind === "conflict") {
      return res.status(409).json({ message: `Cannot reject an application in status '${result.status}'` });
    }

    return res.status(200).json({ id: applicationId, status: result.status });
  })
);


app.post(
  "/v1/requester/applications/:id/confirm",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const body = z
      .object({
        start_at: z.string().min(1),
        end_at: z.string().optional()
      })
      .parse(req.body);

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status !== "accepted" && status !== "confirmed") {
      return res.status(409).json({ message: `Cannot confirm/schedule from status '${status}'` });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    const startAt = new Date(body.start_at);
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ message: "Invalid start_at" });
    const endAt = body.end_at ? new Date(body.end_at) : null;
    if (endAt && Number.isNaN(endAt.getTime())) return res.status(400).json({ message: "Invalid end_at" });

    const existingCommitment = await pool.query(
      "SELECT id FROM request_commitments WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
      [volunteerUserId, requestId]
    );

    let commitmentId: string | null = null;

    if ((existingCommitment.rowCount ?? 0) > 0) {
      commitmentId = String(existingCommitment.rows[0]?.id);
      await pool.query(
        "UPDATE request_commitments SET status = 'confirmed', start_at = $3, end_at = $4, updated_at = NOW() WHERE id = $1 AND volunteer_user_id = $2",
        [commitmentId, volunteerUserId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
    } else {
      const inserted = await pool.query(
        "INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at) VALUES ($1, $2, 'confirmed', $3, $4) RETURNING id",
        [volunteerUserId, requestId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
      commitmentId = inserted.rows[0]?.id ?? null;
    }

    await pool.query(
      "UPDATE request_applications SET status = 'confirmed', status_updated_at = NOW(), status_updated_by_user_id = $2::uuid, updated_at = NOW() WHERE id = $1",
      [applicationId, user.id]
    );

    return res.json({ ok: true, status: "confirmed", commitment_id: commitmentId });
  })
);

app.post(
  "/v1/requester/applications/:id/cancel",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status === "canceled") return res.json({ ok: true, status: "canceled" });
    if (status !== "accepted" && status !== "confirmed") {
      return res.status(409).json({ message: `Cannot cancel from status '${status}'` });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    await pool.query(
      "UPDATE request_applications SET status = 'canceled', status_updated_at = NOW(), status_updated_by_user_id = $2::uuid, updated_at = NOW() WHERE id = $1",
      [applicationId, user.id]
    );

    await pool.query(
      "UPDATE request_commitments SET status = 'canceled', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2 AND status <> 'completed'",
      [volunteerUserId, requestId]
    );

    return res.json({ ok: true, status: "canceled" });
  })
);

app.post(
  "/v1/requester/applications/:id/complete",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if ((appRes.rowCount ?? 0) === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status === "completed") return res.json({ ok: true, status: "completed" });
    if (status !== "confirmed") {
      return res.status(409).json({ message: `Cannot complete from status '${status}'` });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    await pool.query(
      "UPDATE request_applications SET status = 'completed', status_updated_at = NOW(), status_updated_by_user_id = $2::uuid, updated_at = NOW() WHERE id = $1",
      [applicationId, user.id]
    );

    await pool.query(
      "UPDATE request_commitments SET status = 'completed', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2",
      [volunteerUserId, requestId]
    );

    return res.json({ ok: true, status: "completed" });
  })
);


app.post(
  "/v1/requester/applications/:id/review",
  wrap(async (req, res) => {
    const user = await requireRequesterUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const applicationId = idParsed.data;

    const body = z
      .object({
        rating: z.number().int().min(1).max(5),
        strengths: z.string().max(2000).optional(),
        improvements: z.string().max(2000).optional(),
        would_work_again: z.boolean().optional()
      })
      .parse(req.body);

    const appRes = await pool.query(
      `
      SELECT a.id, a.status, a.volunteer_user_id, a.request_id
      FROM request_applications a
      JOIN service_requests r ON r.id = a.request_id
      WHERE a.id = $1 AND r.requester_user_id = $2
      `,
      [applicationId, user.id]
    );

    if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(appRes.rows[0]?.status || "");
    if (status !== "completed") {
      return res.status(409).json({ message: "Reviews can be left once the engagement is completed." });
    }

    const volunteerUserId = String(appRes.rows[0]?.volunteer_user_id);
    const requestId = String(appRes.rows[0]?.request_id);

    const upsert = await pool.query(
      `
      INSERT INTO volunteer_reviews
        (volunteer_user_id, reviewer_user_id, request_application_id, request_id, rating, strengths, improvements, would_work_again)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (request_application_id)
      DO UPDATE SET
        rating = EXCLUDED.rating,
        strengths = EXCLUDED.strengths,
        improvements = EXCLUDED.improvements,
        would_work_again = EXCLUDED.would_work_again
      RETURNING id
      `,
      [
        volunteerUserId,
        user.id,
        applicationId,
        requestId,
        body.rating,
        body.strengths ?? null,
        body.improvements ?? null,
        body.would_work_again ?? null
      ]
    );

    return res.status(201).json({ ok: true, review_id: upsert.rows[0]?.id });
  })
);


// Requester: reputation summary (reviews received as requester + reviews given to volunteers)
app.get("/v1/requester/reputation/summary", wrap(async (req, res) => {
  const user = await requireRequesterUser(req, res);
  if (!user) return;

  const received = await pool.query(
    `SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*) AS count
     FROM requester_reviews
     WHERE requester_user_id = $1`,
    [user.id]
  );

  const given = await pool.query(
    `SELECT COUNT(*) AS count
     FROM volunteer_reviews
     WHERE reviewer_user_id = $1`,
    [user.id]
  );

  return res.json({
    received: { average_rating: Number(received.rows[0]?.avg_rating || 0), count: Number(received.rows[0]?.count || 0) },
    given: { count: Number(given.rows[0]?.count || 0) }
  });
}));

// Requester: reviews received (as requester)
app.get("/v1/requester/history/reviews", wrap(async (req, res) => {
  const user = await requireRequesterUser(req, res);
  if (!user) return;

  const rows = await pool.query(
    `
    SELECT
      rr.id,
      rr.rating,
      rr.strengths,
      rr.improvements,
      rr.would_work_again,
      rr.created_at,
      rr.request_id,
      rr.request_application_id,
      r.title AS request_title,
      COALESCE(p.display_name, p.full_name, u.email, 'Unknown') AS reviewer_name
    FROM requester_reviews rr
    LEFT JOIN service_requests r ON r.id = rr.request_id
    LEFT JOIN users u ON u.id = rr.reviewer_user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE rr.requester_user_id = $1
    ORDER BY rr.created_at DESC
    `,
    [user.id]
  );

  const avg = rows.rows.length
    ? rows.rows.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / rows.rows.length
    : 0;

  return res.json({ average_rating: avg, count: rows.rows.length, reviews: illustrateRows(rows.rows) });
}));

// Requester: reviews given (to volunteers)
app.get("/v1/requester/history/reviews-given", wrap(async (req, res) => {
  const user = await requireRequesterUser(req, res);
  if (!user) return;

  const rows = await pool.query(
    `
    SELECT
      vr.id,
      vr.rating,
      vr.strengths,
      vr.improvements,
      vr.would_work_again,
      vr.created_at,
      vr.request_id,
      vr.request_application_id,
      r.title AS request_title,
      COALESCE(p.display_name, p.full_name, u.email, 'Unknown') AS volunteer_name
    FROM volunteer_reviews vr
    LEFT JOIN service_requests r ON r.id = vr.request_id
    LEFT JOIN users u ON u.id = vr.volunteer_user_id
    LEFT JOIN user_profiles p ON p.user_id = u.id
    WHERE vr.reviewer_user_id = $1
    ORDER BY vr.created_at DESC
    `,
    [user.id]
  );

  return res.json({ count: rows.rows.length, reviews: illustrateRows(rows.rows) });
}));




// Volunteer area: dashboard counts + supporting lists (Step 3.1)
app.get(
  "/v1/volunteer/dashboard",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // One round-trip for all dashboard counters (previously 6 sequential queries).
    const r = await pool.query(
      `WITH a AS (
         SELECT COALESCE(remote_ok, TRUE) AS remote_ok, COALESCE(in_person_ok, TRUE) AS in_person_ok
           FROM (SELECT 1) x LEFT JOIN user_availability ua ON ua.user_id = $1
       )
       SELECT
         (SELECT COUNT(*)::int FROM service_requests sr, a
           WHERE sr.status = 'open'
             AND (sr.mode IS NULL
                  OR (a.remote_ok AND sr.mode IN ('remote','hybrid'))
                  OR (a.in_person_ok AND sr.mode IN ('in-person','hybrid')))) AS recommended,
         (SELECT COUNT(*)::int FROM volunteer_saved_requests WHERE user_id = $1) AS saved,
         (SELECT COUNT(*)::int FROM request_applications
           WHERE volunteer_user_id = $1 AND status IN ('pending','accepted')) AS applications,
         (SELECT COUNT(*)::int FROM direct_messages WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread,
         (SELECT COUNT(*)::int FROM request_commitments
           WHERE volunteer_user_id = $1 AND start_at > NOW() AND status IN ('scheduled','confirmed')) AS upcoming`,
      [user.id]
    );
    const c = r.rows[0] as Record<string, number>;

    return res.json({
      recommendedOpportunities: c.recommended ?? 0,
      savedOpportunities: c.saved ?? 0,
      applicationsNeedingAction: c.applications ?? 0,
      unreadMessages: c.unread ?? 0,
      upcomingCommitments: c.upcoming ?? 0
    });
  })
);



// Volunteer area: profile (Step 3.15)
app.get(
  "/v1/volunteer/profile",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const prof = await pool.query(
      "SELECT full_name, display_name, avatar_url, phone, public_location, location, bio, languages, interaction_styles, availability_windows, help_categories, has_car, can_lift_heavy, stairs_ok, pet_friendly, service_radius_miles, experience, experience_tags, need_categories, need_help_prompt, parking_available, elevator_available, stairs_present, pickup_vs_dropoff, time_flexibility, pets_at_home, smoke_free, accessibility_needs, meet_in_public_first, someone_else_present, mask_preferred, updated_at FROM user_profiles WHERE user_id = $1",
      [user.id]
    );

    return res.json({
      user: { id: user.id, email: user.email, role: user.role },
      profile: prof.rows[0] || null
    });
  })
);

app.post(
  "/v1/volunteer/profile",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // Full name is required for volunteer profiles.
    const schema = z.object({ fullName: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Full name is required" });
    }

    // Reuse onboarding profile handler to persist profile fields.
    return setProfile(pool, req, res);
  })
);


// Volunteer area: opportunity discovery lists + detail (Step 3.2 / 3.3)

type VolunteerOpportunityRow = {
  id: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid";
  updated_at: string;
  organization_slug: string | null;
  organization_name: string | null;
  tags: string[];
  saved: boolean;
  application_id: string | null;
  application_status: string | null;
};

async function volunteerOpportunityRowsForUser(
  userId: string,
  whereSql: string,
  whereParams: any[] = [],
  orderSql = "o.updated_at DESC"
): Promise<VolunteerOpportunityRow[]> {
  const w = whereSql.trim();
  const effectiveWhereSql =
    w === ""
      ? "WHERE o.status = 'open'"
      : /^WHERE\b/i.test(w)
        ? w.replace(/^WHERE\b/i, "WHERE o.status = 'open' AND")
        : `WHERE o.status = 'open' AND (${w})`;

  const rows = await pool.query(
    `
    SELECT
      o.id,
      o.title,
      LEFT(o.description, 240) AS summary,
      COALESCE(o.location_text, '') AS location,
      COALESCE(o.mode, 'remote') AS mode,
      o.updated_at,
      o.requester_org_slug AS organization_slug,
      org.name AS organization_name,
      o.tags,
      (s.user_id IS NOT NULL) AS saved,
      a.id AS application_id,
      a.status AS application_status
    FROM service_requests o
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
      LEFT JOIN LATERAL (
        SELECT id, status, message, created_at
        FROM request_applications
        WHERE volunteer_user_id = $1 AND request_id = o.id
        ORDER BY updated_at DESC
        LIMIT 1
      ) a ON TRUE
    ${effectiveWhereSql}
    ORDER BY ${orderSql}
    `,
    [userId, ...whereParams]
  );
  return rows.rows as VolunteerOpportunityRow[];
}


app.get(
  "/v1/volunteer/opportunities/recommended",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    try {

    // Profile signals (tags + freeform experience) feed a simple, deterministic recommender.
    const profile = await pool.query(
      `
      SELECT
        COALESCE(help_categories, '{}'::text[]) AS help_categories,
        COALESCE(experience_tags, '{}'::text[]) AS experience_tags,
        COALESCE(languages, '{}'::text[]) AS languages,
        COALESCE(interaction_styles, '{}'::text[]) AS interaction_styles,
        COALESCE(service_radius_miles, 25) AS radius,
        COALESCE(experience, '') AS experience,
        public_location,
        location
      FROM user_profiles
      WHERE user_id = $1
      `,
      [user.id]
    );

    const p = (profile.rows[0] || {}) as any;
    const userTags = Array.from(new Set([...(p.help_categories || []), ...(p.experience_tags || [])].map((s: any) => String(s).toLowerCase())));
    const experience = String(p.experience || "").trim();

    const radius = Math.min(Math.max(Math.floor(Number(p.radius || 25)), 1), 200);
    const label = String(p.public_location || p.location || "").trim();

    // Availability mode constraints
    const avail = await pool.query(
      `SELECT remote_ok, in_person_ok FROM user_availability WHERE user_id=$1`,
      [user.id]
    );

    const remoteOk = Boolean(avail.rows[0]?.remote_ok ?? true);
    const inPersonOk = Boolean(avail.rows[0]?.in_person_ok ?? true);

    const allowedModes: string[] = [];
    if (remoteOk) allowedModes.push("remote", "hybrid");
    if (inPersonOk) allowedModes.push("in-person", "hybrid");
    if (allowedModes.length === 0) allowedModes.push("remote");

    // Keep geo reasonably fresh so distance can contribute when applicable.
    const userGeo = await cachedUserGeo(user.id);

    const distanceExpr = `
      (3958.7613 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS((o.location_lat - $5) / 2)), 2)
        + COS(RADIANS($5)) * COS(RADIANS(o.location_lat))
        * POWER(SIN(RADIANS((o.location_lng - $6) / 2)), 2)
      )))
    `;

    let rows: any;
    try {
      rows = await pool.query(
      `
      WITH base AS (
        SELECT
          o.id,
          o.title,
          LEFT(o.description, 240) AS summary,
          COALESCE(o.location_text, '') AS location,
          COALESCE(o.mode, 'remote') AS mode,
          o.updated_at,
          org.name AS organization_name,
          o.requester_org_slug AS organization_slug,
          o.requester_user_id AS requester_user_id,
          o.tags,
          (s.user_id IS NOT NULL) AS saved,
          a.id AS application_id,
          a.status AS application_status,
          ARRAY(
            SELECT unnest(COALESCE(o.tags, '{}'::text[]))
            INTERSECT
            SELECT unnest($2::text[])
          ) AS matched_tags,
          similarity($3, COALESCE(o.title, '') || ' ' || COALESCE(o.description, '')) AS text_sim,
          CASE
            WHEN $4::boolean AND o.location_lat IS NOT NULL AND o.location_lng IS NOT NULL AND $5::float8 IS NOT NULL AND $6::float8 IS NOT NULL
            THEN ${distanceExpr}
            ELSE NULL
          END AS distance_miles
        FROM service_requests o
        LEFT JOIN organizations org ON org.slug = o.requester_org_slug
        LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
        LEFT JOIN LATERAL (
          SELECT id, status
          FROM request_applications
          WHERE volunteer_user_id = $1 AND request_id = o.id
          ORDER BY updated_at DESC
          LIMIT 1
        ) a ON TRUE
        WHERE
          o.status = 'open'
          AND COALESCE(o.mode, 'remote') = ANY($7::text[])
      )
      SELECT
        *,
        COALESCE(array_length(matched_tags, 1), 0) AS tag_overlap,
        GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) AS recency_score,
        CASE
          WHEN distance_miles IS NULL THEN 0
          WHEN distance_miles <= $8 THEN GREATEST(0, 1 - (distance_miles / $8))
          ELSE 0
        END AS distance_score,
        (
          (COALESCE(array_length(matched_tags, 1), 0) * 3.0)
          + (GREATEST(text_sim, 0) * 5.0)
          + (GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) * 2.0)
          + (CASE
              WHEN distance_miles IS NULL THEN 0
              WHEN distance_miles <= $8 THEN GREATEST(0, 1 - (distance_miles / $8)) * 1.5
              ELSE 0
            END)
        ) AS recommendation_score
      FROM base
      ORDER BY recommendation_score DESC, updated_at DESC
      LIMIT 60
      `,
      [
        user.id,
        userTags,
        experience,
        userGeo ? true : false,
        userGeo ? userGeo.lat : null,
        userGeo ? userGeo.lng : null,
        allowedModes,
        radius
      ]
    );
    } catch (e: any) {
      const msg = String(e?.message || "").toLowerCase();
      const code = String(e?.code || "");
      // If pg_trgm isn't installed, Postgres throws undefined_function (42883) for similarity()
      const missingSimilarity = code === "42883" && msg.includes("similarity");
      if (!missingSimilarity) throw e;

      rows = await pool.query(
      `WITH base AS (
        SELECT
          o.id,
          o.title,
          LEFT(o.description, 240) AS summary,
          COALESCE(o.location_text, '') AS location,
          COALESCE(o.mode, 'remote') AS mode,
          o.updated_at,
          org.name AS organization_name,
          o.requester_org_slug AS organization_slug,
          o.requester_user_id AS requester_user_id,
          o.tags,
          (s.user_id IS NOT NULL) AS saved,
          a.id AS application_id,
          a.status AS application_status,
          ARRAY(
            SELECT unnest(COALESCE(o.tags, '{}'::text[]))
            INTERSECT
            SELECT unnest($2::text[])
          ) AS matched_tags,
          0::double precision AS text_sim,
          CASE
            WHEN $3::boolean AND o.location_lat IS NOT NULL AND o.location_lng IS NOT NULL AND $4::float8 IS NOT NULL AND $5::float8 IS NOT NULL
            THEN (3958.7613 * 2 * ASIN(SQRT(
              POWER(SIN(RADIANS((o.location_lat - $4) / 2)), 2)
              + COS(RADIANS($4)) * COS(RADIANS(o.location_lat))
              * POWER(SIN(RADIANS((o.location_lng - $5) / 2)), 2)
            )))
            ELSE NULL
          END AS distance_miles
        FROM service_requests o
        LEFT JOIN organizations org ON org.slug = o.requester_org_slug
        LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
        LEFT JOIN LATERAL (
          SELECT id, status
          FROM request_applications
          WHERE volunteer_user_id = $1 AND request_id = o.id
          ORDER BY updated_at DESC
          LIMIT 1
        ) a ON TRUE
        WHERE
          o.status = 'open'
          AND COALESCE(o.mode, 'remote') = ANY($6::text[])
      )
      SELECT
        *,
        COALESCE(array_length(matched_tags, 1), 0) AS tag_overlap,
        GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) AS recency_score,
        CASE
          WHEN distance_miles IS NULL THEN 0
          WHEN distance_miles <= $7 THEN GREATEST(0, 1 - (distance_miles / $7))
          ELSE 0
        END AS distance_score,
        (
          (COALESCE(array_length(matched_tags, 1), 0) * 3.0)
          + (GREATEST(0, 1 - (EXTRACT(EPOCH FROM (NOW() - updated_at)) / 86400) / 30.0) * 2.0)
          + (CASE
              WHEN distance_miles IS NULL THEN 0
              WHEN distance_miles <= $7 THEN GREATEST(0, 1 - (distance_miles / $7)) * 1.5
              ELSE 0
            END)
        ) AS recommendation_score
      FROM base
      ORDER BY recommendation_score DESC, updated_at DESC
      LIMIT 60`,
      [
        user.id,
        userTags,
        userGeo ? true : false,
        userGeo ? userGeo.lat : null,
        userGeo ? userGeo.lng : null,
        allowedModes,
        radius
      ]
    );
    }

    const out = (rows.rows as any[]).map((r) => {
      const reasons: string[] = [];
      const matched = Array.isArray(r.matched_tags) ? r.matched_tags.filter(Boolean) : [];
      if (matched.length) reasons.push(`Matches your interests: ${matched.slice(0, 3).join(', ')}`);
      const textSim = Number(r.text_sim || 0);
      if (textSim >= 0.25 && experience) reasons.push("Similar to your experience");
      const d = Number(r.distance_miles);
      if (Number.isFinite(d) && d <= radius) reasons.push(`Close by: ${d.toFixed(1)} mi`);
      if (!reasons.length) reasons.push("Based on your profile");

      return {
        ...r,
        recommendation_reason: reasons[0],
        recommendation_reasons: reasons,
        recommendation_score: Number(r.recommendation_score || 0)
      };
    });

    res.setHeader("x-volunteer-radius-miles", String(radius));
    res.setHeader("x-volunteer-location-label", label);

    return res.json(out);
    } catch (e: any) {
      console.error("/v1/volunteer/opportunities/recommended failed", e);
      const rows = await volunteerOpportunityRowsForUser(user.id, "", [], "o.updated_at DESC").catch(() => []);
      res.setHeader("x-volunteer-recommended-fallback", "1");
      return res.json(rows);
    }
  })
);


app.get(
  "/v1/volunteer/opportunities/remote",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    try {
      const modes = ["remote", "hybrid"];
      const rows = await volunteerOpportunityRowsForUser(
        user.id,
        "WHERE COALESCE(o.mode, 'remote') = ANY($2::text[])",
        [modes]
      );
      return res.json(rows);
    } catch (e: any) {
      console.error("/v1/volunteer/opportunities/remote failed", e);
      res.setHeader("x-volunteer-remote-fallback", "1");
      return res.json([]);
    }
  })
);

app.get(
  "/v1/volunteer/opportunities/nearby",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // Allow callers to override radius (miles) via ?radius=25
    const radiusQ = Number((req.query as any)?.radius);

    const profile = await pool.query(
      `SELECT COALESCE(service_radius_miles, 25) AS radius, public_location, location FROM user_profiles WHERE user_id=$1`,
      [user.id]
    );

    const defaultRadius = Number(profile.rows[0]?.radius || 25);
    const radius = Number.isFinite(radiusQ) && radiusQ > 0 ? Math.min(Math.max(Math.floor(radiusQ), 1), 200) : Math.min(Math.max(Math.floor(defaultRadius), 1), 200);

    const label = String(profile.rows[0]?.public_location || profile.rows[0]?.location || "").trim();

    // Best-effort: backfill a few recently-updated requests so the first "Nearby" load isn't empty.

    const userGeo = await cachedUserGeo(user.id);
    if (!userGeo) {
      res.setHeader("x-volunteer-location-missing", "1");
      res.setHeader("x-volunteer-radius-miles", String(radius));
      res.setHeader("x-volunteer-location-label", label);
      return res.json([]);
    }

    const distanceExpr = `
      (3958.7613 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS((o.location_lat - $2) / 2)), 2)
        + COS(RADIANS($2)) * COS(RADIANS(o.location_lat))
        * POWER(SIN(RADIANS((o.location_lng - $3) / 2)), 2)
      )))
    `;

    const rows = await pool.query(
      `
      SELECT
        o.id,
        o.title,
        LEFT(o.description, 240) AS summary,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        o.updated_at,
        org.name AS organization_name,
        o.requester_org_slug AS organization_slug,
        o.requester_user_id AS requester_user_id,
        o.tags,
        (s.user_id IS NOT NULL) AS saved,
        a.id AS application_id,
        a.status AS application_status,
        ${distanceExpr} AS distance_miles
      FROM service_requests o
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
      LEFT JOIN LATERAL (
        SELECT id, status
        FROM request_applications
        WHERE volunteer_user_id = $1 AND request_id = o.id
        ORDER BY updated_at DESC
        LIMIT 1
      ) a ON TRUE
      WHERE
        o.status = 'open'
        AND COALESCE(o.mode, 'remote') IN ('in-person','hybrid')
        AND o.location_lat IS NOT NULL
        AND o.location_lng IS NOT NULL
        AND ${distanceExpr} <= $4
      ORDER BY distance_miles ASC, o.updated_at DESC
      LIMIT 60
      `,
      [user.id, userGeo.lat, userGeo.lng, radius]
    );

    res.setHeader("x-volunteer-location-missing", "0");
    res.setHeader("x-volunteer-radius-miles", String(radius));
    res.setHeader("x-volunteer-location-label", label);

    return res.json(rows.rows);
  })
);




async function listVolunteerSavedOpportunities(userId: string) {
  const rows = await pool.query(
    `
    SELECT
      o.id,
      o.title,
      LEFT(o.description, 240) AS summary,
      COALESCE(o.location_text, '') AS location,
      COALESCE(o.mode, 'remote') AS mode,
      o.updated_at,
      o.requester_org_slug AS organization_slug,
      org.name AS organization_name,
      o.requester_user_id AS requester_user_id,
      o.tags,
      TRUE AS saved,
      a.id AS application_id,
      a.status AS application_status,
      s.created_at AS saved_at
    FROM volunteer_saved_requests s
    JOIN service_requests o ON o.id = s.request_id
    LEFT JOIN organizations org ON org.slug = o.requester_org_slug
    LEFT JOIN LATERAL (
      SELECT id, status
      FROM request_applications
      WHERE volunteer_user_id = $1 AND request_id = o.id
      ORDER BY updated_at DESC
      LIMIT 1
    ) a ON TRUE
    WHERE s.user_id = $1
    ORDER BY s.created_at DESC
    `,
    [userId]
  );

  return rows.rows;
}

app.get(
  "/v1/volunteer/opportunities/saved",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const items = await listVolunteerSavedOpportunities(user.id);

    return res.json(items);
  })
);


app.get(
  "/v1/volunteer/opportunities/:id",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        o.id,
        o.title,
        o.description AS summary,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        o.updated_at,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags,
        (s.user_id IS NOT NULL) AS saved,
        a.id AS application_id,
        a.status AS application_status,
        a.message AS application_message,
        a.created_at AS application_created_at
      FROM service_requests o
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      LEFT JOIN volunteer_saved_requests s ON s.user_id = $1 AND s.request_id = o.id
      LEFT JOIN LATERAL (
        SELECT id, status, message, created_at
        FROM request_applications
        WHERE volunteer_user_id = $1 AND request_id = o.id
        ORDER BY updated_at DESC
        LIMIT 1
      ) a ON TRUE
      WHERE o.id = $2
      `,
      [user.id, id]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    return res.json(rows.rows[0]);
  })
);

app.post(
  "/v1/volunteer/opportunities/:id/save",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const exists = await pool.query("SELECT 1 FROM service_requests WHERE id = $1", [id]);
    if (exists.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    await pool.query(
      "INSERT INTO volunteer_saved_requests (user_id, request_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [user.id, id]
    );

    return res.status(200).json({ saved: true });
  })
);

app.delete(
  "/v1/volunteer/opportunities/:id/save",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    await pool.query("DELETE FROM volunteer_saved_requests WHERE user_id = $1 AND request_id = $2", [user.id, id]);

    return res.status(200).json({ saved: false });
  })
);

app.post(
  "/v1/volunteer/opportunities/:id/apply",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid id" });
    const id = idParsed.data;

    const reqRow = await pool.query(
      "SELECT requester_user_id FROM service_requests WHERE id = $1 AND status = 'open'",
      [id]
    );
    if (reqRow.rowCount === 0) return res.status(404).json({ message: "Opportunity not found" });

    const ownerId = reqRow.rows[0]?.requester_user_id ? String(reqRow.rows[0].requester_user_id) : "";
    if (ownerId && ownerId === String(user.id)) {
      return res.status(403).json({ message: "You can't apply to your own request." });
    }

    const schema = z.object({
      message: z.string().trim().min(1).max(5000)
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const already = await pool.query(
      "SELECT id, status FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
      [user.id, id]
    );
    if (already.rows.length > 0) {
      return res.status(200).json({ applicationId: already.rows[0].id, status: already.rows[0].status });
    }

    const inserted = await pool.query(
      "INSERT INTO request_applications (volunteer_user_id, request_id, status, message) VALUES ($1, $2, 'pending', $3) RETURNING id, status, created_at",
      [user.id, id, parsed.data.message]
    );

    return res.status(201).json({
      applicationId: inserted.rows[0]?.id,
      status: inserted.rows[0]?.status,
      createdAt: inserted.rows[0]?.created_at
    });
  })
);

app.get(
  "/v1/volunteer/saved",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    // Deprecated alias for backwards compatibility (shares canonical implementation).
    res.setHeader("x-deprecated", "Use /v1/volunteer/opportunities/saved instead.");

    const items = await listVolunteerSavedOpportunities(user.id);

    return res.json(items);
  })
);



app.get(
  "/v1/volunteer/applications",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.request_id AS opportunity_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        o.title,
        LEFT(o.description, 240) AS summary,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        o.requester_org_slug AS organization_slug,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags
      FROM request_applications a
      JOIN service_requests o ON o.id = a.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE a.volunteer_user_id = $1
      ORDER BY a.updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.get(
  "/v1/volunteer/applications/:id",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const rows = await pool.query(
      `
      SELECT
        a.id,
        a.request_id AS opportunity_id,
        a.status,
        a.message,
        a.created_at,
        a.updated_at,
        o.title,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags
      FROM request_applications a
      JOIN service_requests o ON o.id = a.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE a.volunteer_user_id = $1
        AND a.id = $2
      LIMIT 1
      `,
      [user.id, id]
    );

    if (rows.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const r = rows.rows[0] as any;

    const commitmentRes = await pool.query(
      `
      SELECT id, status, start_at, end_at
      FROM request_commitments
      WHERE volunteer_user_id = $1 AND request_id = $2
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [user.id, r.opportunity_id]
    );

    const commitment = commitmentRes.rowCount
      ? {
          id: commitmentRes.rows[0].id,
          status: commitmentRes.rows[0].status,
          start_at: commitmentRes.rows[0].start_at,
          end_at: commitmentRes.rows[0].end_at
        }
      : null;

    return res.json({
      id: r.id,
      opportunity_id: r.opportunity_id,
      status: r.status,
      message: r.message,
      created_at: r.created_at,
      updated_at: r.updated_at,
      requester_user_id: r.requester_user_id ?? null,
      commitment,
      opportunity: {
        id: r.opportunity_id,
        title: r.title,
        location: r.location,
        mode: r.mode,
        organization_name: r.organization_name,
        tags: r.tags
      }
    });
  })
);



app.post(
  "/v1/volunteer/applications/:id/withdraw",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const existing = await pool.query(
      "SELECT id, status FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(existing.rows[0]?.status || "");
    if (status !== "pending" && status !== "waitlisted") {
      return res.status(409).json({ message: `Cannot withdraw from status '${status}'` });
    }

    const updated = await pool.query(
      "UPDATE request_applications SET status = 'withdrawn', updated_at = NOW() WHERE id = $1 RETURNING id, status, updated_at",
      [id]
    );

    return res.status(200).json({ id: updated.rows[0]?.id, status: updated.rows[0]?.status, updated_at: updated.rows[0]?.updated_at });
  })
);

app.post(
  "/v1/volunteer/applications/:id/schedule",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const body = z
      .object({
        start_at: z.string().min(1),
        end_at: z.string().optional()
      })
      .parse(req.body);

    const existing = await pool.query(
      "SELECT id, status, request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(existing.rows[0]?.status || "");
    if (status !== "accepted" && status !== "confirmed") {
      return res.status(409).json({ message: `Cannot schedule from status '${status}'` });
    }

    const requestId = String(existing.rows[0]?.request_id);
    const startAt = new Date(body.start_at);
    if (Number.isNaN(startAt.getTime())) return res.status(400).json({ message: "Invalid start_at" });
    const endAt = body.end_at ? new Date(body.end_at) : null;
    if (endAt && Number.isNaN(endAt.getTime())) return res.status(400).json({ message: "Invalid end_at" });

    const existingCommitment = await pool.query(
      "SELECT id FROM request_commitments WHERE volunteer_user_id = $1 AND request_id = $2 ORDER BY updated_at DESC LIMIT 1",
      [user.id, requestId]
    );

    let commitmentId: string | null = null;

    if ((existingCommitment.rowCount ?? 0) > 0) {
      commitmentId = String(existingCommitment.rows[0]?.id);
      await pool.query(
        "UPDATE request_commitments SET status = 'confirmed', start_at = $3, end_at = $4, updated_at = NOW() WHERE id = $1 AND volunteer_user_id = $2",
        [commitmentId, user.id, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
    } else {
      const inserted = await pool.query(
        "INSERT INTO request_commitments (volunteer_user_id, request_id, status, start_at, end_at) VALUES ($1, $2, 'confirmed', $3, $4) RETURNING id",
        [user.id, requestId, startAt.toISOString(), endAt ? endAt.toISOString() : null]
      );
      commitmentId = inserted.rows[0]?.id ?? null;
    }

    await pool.query("UPDATE request_applications SET status = 'confirmed', updated_at = NOW() WHERE id = $1", [id]);

    return res.status(200).json({ ok: true, commitment_id: commitmentId });
  })
);

app.post(
  "/v1/volunteer/applications/:id/complete",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
    const id = idParsed.data;

    const existing = await pool.query(
      "SELECT id, status, request_id FROM request_applications WHERE id = $1 AND volunteer_user_id = $2",
      [id, user.id]
    );
    if (existing.rowCount === 0) return res.status(404).json({ message: "Application not found" });

    const status = String(existing.rows[0]?.status || "");
    if (status !== "confirmed") return res.status(409).json({ message: `Cannot complete from status '${status}'` });

    const requestId = String(existing.rows[0]?.request_id);

    await pool.query("UPDATE request_applications SET status = 'completed', updated_at = NOW() WHERE id = $1", [id]);
    await pool.query(
      "UPDATE request_commitments SET status = 'completed', updated_at = NOW() WHERE volunteer_user_id = $1 AND request_id = $2",
      [user.id, requestId]
    );

    return res.status(200).json({ ok: true, status: "completed" });
  })
);




// Volunteer: required waiver/training documents for a request + acknowledgement
app.get(
  "/v1/volunteer/requests/:id/documents",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid request id" });
    const requestId = idParsed.data;

    const reqRow = await pool.query("SELECT requester_org_slug FROM service_requests WHERE id = $1", [requestId]);
    if ((reqRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Opportunity not found" });
    const orgSlug = String(reqRow.rows[0]?.requester_org_slug || "");
    if (!orgSlug) return res.json({ documents: [] });

    const hasApp = await pool.query(
      "SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 LIMIT 1",
      [user.id, requestId]
    );
    if ((hasApp.rowCount ?? 0) === 0) return res.status(403).json({ message: "You must apply to view required documents for this request." });

    const docs = await pool.query(
      `
      SELECT
        d.id,
        d.doc_type,
        d.title,
        d.description,
        d.file_name,
        d.mime_type,
        d.require_ack,
        d.active,
        (ack.id IS NOT NULL) AS acknowledged,
        ack.acknowledged_at
      FROM org_document_assignments a
      JOIN org_documents d ON d.id = a.org_document_id
      LEFT JOIN volunteer_document_acks ack
        ON ack.org_document_id = d.id
        AND ack.volunteer_user_id = $2
        AND ack.request_id = $1
      WHERE d.org_slug = $3
        AND d.active = TRUE
        AND (a.request_id = $1 OR a.request_id IS NULL)
      ORDER BY d.created_at DESC
      `,
      [requestId, user.id, orgSlug]
    );

    return res.json({ documents: docs.rows });
  })
);

app.post(
  "/v1/volunteer/documents/:id/ack",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid document id" });
    const docId = idParsed.data;

    const body = z.object({ request_id: z.string().uuid() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid payload", errors: body.error.flatten() });

    const requestId = String(body.data.request_id);

    const reqRow = await pool.query("SELECT requester_org_slug FROM service_requests WHERE id = $1", [requestId]);
    if ((reqRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Opportunity not found" });
    const orgSlug = String(reqRow.rows[0]?.requester_org_slug || "");
    if (!orgSlug) return res.status(404).json({ message: "No organization associated with this request" });

    const hasApp = await pool.query(
      "SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 LIMIT 1",
      [user.id, requestId]
    );
    if ((hasApp.rowCount ?? 0) === 0) return res.status(403).json({ message: "You must apply to acknowledge documents for this request." });

    const assigned = await pool.query(
      `
      SELECT 1
      FROM org_document_assignments a
      JOIN org_documents d ON d.id = a.org_document_id
      WHERE d.org_slug = $1
        AND d.id = $2
        AND d.active = TRUE
        AND (a.request_id = $3 OR a.request_id IS NULL)
      LIMIT 1
      `,
      [orgSlug, docId, requestId]
    );
    if ((assigned.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not assigned to this request" });

    await pool.query(
      `
      INSERT INTO volunteer_document_acks (org_document_id, volunteer_user_id, request_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (org_document_id, volunteer_user_id, request_id) DO NOTHING
      `,
      [docId, user.id, requestId]
    );

    return res.status(200).json({ ok: true });
  })
);

app.get(
  "/v1/volunteer/documents/:id/download",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) return res.status(400).json({ message: "Invalid document id" });
    const docId = idParsed.data;

    const q = z.object({ requestId: z.string().uuid() }).safeParse(req.query);
    if (!q.success) return res.status(400).json({ message: "requestId is required" });
    const requestId = String(q.data.requestId);

    const reqRow = await pool.query("SELECT requester_org_slug FROM service_requests WHERE id = $1", [requestId]);
    if ((reqRow.rowCount ?? 0) === 0) return res.status(404).json({ message: "Opportunity not found" });
    const orgSlug = String(reqRow.rows[0]?.requester_org_slug || "");
    if (!orgSlug) return res.status(404).json({ message: "No organization associated with this request" });

    const hasApp = await pool.query(
      "SELECT 1 FROM request_applications WHERE volunteer_user_id = $1 AND request_id = $2 LIMIT 1",
      [user.id, requestId]
    );
    if ((hasApp.rowCount ?? 0) === 0) return res.status(403).json({ message: "You must apply to download documents for this request." });

    const row = await pool.query(
      `
      SELECT d.file_name, d.mime_type, d.bytes
      FROM org_document_assignments a
      JOIN org_documents d ON d.id = a.org_document_id
      WHERE d.org_slug = $1
        AND d.id = $2
        AND d.active = TRUE
        AND (a.request_id = $3 OR a.request_id IS NULL)
      LIMIT 1
      `,
      [orgSlug, docId, requestId]
    );

    if ((row.rowCount ?? 0) === 0) return res.status(404).json({ message: "Document not found" });

    const r = row.rows[0] as any;
    res.setHeader("content-type", r.mime_type || "application/octet-stream");
    res.setHeader("content-disposition", contentDisposition(r.file_name));
    return res.status(200).send(r.bytes);
  })
);

// Volunteer: leave a review for the requester (two-sided reputation)
app.get("/v1/volunteer/applications/:id/review-requester", wrap(async (req, res) => {
  const user = await requireVolunteerUser(req, res);
  if (!user) return;

  const idParsed = z.string().uuid().safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
  const applicationId = idParsed.data;

  const row = await pool.query(
    `
    SELECT
      rr.id,
      rr.rating,
      rr.strengths,
      rr.improvements,
      rr.would_work_again,
      rr.created_at
    FROM requester_reviews rr
    WHERE rr.request_application_id = $1 AND rr.reviewer_user_id = $2
    LIMIT 1
    `,
    [applicationId, user.id]
  );

  return res.json({ review: row.rowCount ? illustrateRows(row.rows[0]) : null });
}));

app.post("/v1/volunteer/applications/:id/review-requester", wrap(async (req, res) => {
  const user = await requireVolunteerUser(req, res);
  if (!user) return;

  const idParsed = z.string().uuid().safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ message: "Invalid application id" });
  const applicationId = idParsed.data;

  const body = z
    .object({
      rating: z.number().int().min(1).max(5),
      strengths: z.string().max(2000).optional(),
      improvements: z.string().max(2000).optional(),
      would_work_again: z.boolean().optional()
    })
    .parse(req.body);

  const appRes = await pool.query(
    `
    SELECT a.id, a.status, a.request_id, r.requester_user_id
    FROM request_applications a
    JOIN service_requests r ON r.id = a.request_id
    WHERE a.id = $1 AND a.volunteer_user_id = $2
    `,
    [applicationId, user.id]
  );

  if (appRes.rowCount === 0) return res.status(404).json({ message: "Application not found" });

  const status = String(appRes.rows[0]?.status || "");
  if (status !== "completed") {
    return res.status(409).json({ message: "Reviews can be left once the engagement is completed." });
  }

  const requestId = String(appRes.rows[0]?.request_id);
  const requesterUserId = String(appRes.rows[0]?.requester_user_id);

  const upsert = await pool.query(
    `
    INSERT INTO requester_reviews
      (requester_user_id, reviewer_user_id, request_application_id, request_id, rating, strengths, improvements, would_work_again)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (request_application_id)
    DO UPDATE SET
      rating = EXCLUDED.rating,
      strengths = EXCLUDED.strengths,
      improvements = EXCLUDED.improvements,
      would_work_again = EXCLUDED.would_work_again
    RETURNING id
    `,
    [
      requesterUserId,
      user.id,
      applicationId,
      requestId,
      body.rating,
      body.strengths || null,
      body.improvements || null,
      typeof body.would_work_again === "boolean" ? body.would_work_again : null
    ]
  );

  return res.json({ id: String(upsert.rows[0]?.id), ok: true });
}));


app.get(
  "/v1/volunteer/calendar/commitments",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        c.id,
        c.status,
        c.start_at,
        c.end_at,
        c.request_id AS opportunity_id,
        o.title,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode
      FROM request_commitments c
      LEFT JOIN service_requests o ON o.id = c.request_id
      WHERE c.volunteer_user_id = $1
        AND c.status IN ('scheduled','confirmed')
        AND c.start_at IS NOT NULL
        AND c.start_at > NOW()
      ORDER BY c.start_at ASC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.get(
  "/v1/volunteer/messages/inbox",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      WITH msgs AS (
        SELECT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id,
          sender_user_id,
          recipient_user_id,
          request_id,
          application_id,
          body,
          created_at,
          read_at
        FROM direct_messages
        WHERE sender_user_id = $1 OR recipient_user_id = $1
      ),
      agg AS (
        SELECT
          peer_id,
          request_id,
          application_id,
          MAX(created_at) AS last_at,
          COUNT(*) FILTER (WHERE recipient_user_id = $1 AND read_at IS NULL) AS unread_count
        FROM msgs
        WHERE NOT EXISTS (
          SELECT 1 FROM user_blocks b
          WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = peer_id)
             OR (b.blocker_user_id = peer_id AND b.blocked_user_id = $1)
        )
        GROUP BY peer_id, request_id, application_id
      ),
      last_msg AS (
        SELECT DISTINCT ON (peer_id, request_id, application_id)
          peer_id,
          request_id,
          application_id,
          body AS last_body,
          created_at AS last_at
        FROM msgs
        ORDER BY peer_id, request_id, application_id, created_at DESC
      )
      SELECT
        a.peer_id,
        a.request_id,
        a.application_id,
        r.title AS request_title,
        u.email AS peer_email,
        COALESCE(p.display_name, p.full_name, u.email) AS peer_display_name,
        p.avatar_url AS peer_avatar_url,
        COALESCE(p.public_location, p.location) AS peer_public_location,
        l.last_body,
        l.last_at,
        a.unread_count::int AS unread_count
      FROM agg a
      JOIN last_msg l ON l.peer_id = a.peer_id
        AND l.request_id IS NOT DISTINCT FROM a.request_id
        AND l.application_id IS NOT DISTINCT FROM a.application_id
      JOIN users u ON u.id = a.peer_id
      LEFT JOIN user_profiles p ON p.user_id = a.peer_id
      LEFT JOIN service_requests r ON r.id = a.request_id
      ORDER BY l.last_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.get(
  "/v1/volunteer/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const peerIdParsed = z.string().uuid().safeParse(req.params.peerId);
    if (!peerIdParsed.success) return res.status(400).json({ message: "Invalid peer id" });
    const peerId = peerIdParsed.data;

    if (await isBlockedBetween(user.id, peerId)) {
      return res
        .status(403)
        .json({ message: "This conversation is unavailable because one of you has blocked the other." });
    }

    if (peerId === user.id) return res.status(400).json({ message: "Invalid peer id" });

    // Mark unread messages from peer as read
    await pool.query(
      "UPDATE direct_messages SET read_at = NOW() WHERE sender_user_id = $1 AND recipient_user_id = $2 AND read_at IS NULL",
      [peerId, user.id]
    );

    const peerRes = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        COALESCE(p.display_name, p.full_name, u.email) AS display_name,
        p.avatar_url,
        COALESCE(p.public_location, p.location) AS public_location
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id = $1
      `,
      [peerId]
    );
    if (peerRes.rowCount === 0) return res.status(404).json({ message: "Peer not found" });

    const messagesRes = await pool.query(
      `
      SELECT
        id,
        sender_user_id,
        recipient_user_id,
        body,
        created_at,
        read_at
      FROM direct_messages
      WHERE (sender_user_id = $1 AND recipient_user_id = $2)
         OR (sender_user_id = $2 AND recipient_user_id = $1)
      ORDER BY created_at ASC
      `,
      [user.id, peerId]
    );

    return res.json({
      peer: peerRes.rows[0],
      messages: messagesRes.rows
    });
  })
);

app.post(
  "/v1/volunteer/messages/thread/:peerId",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const peerIdParsed = z.string().uuid().safeParse(req.params.peerId);
    if (!peerIdParsed.success) return res.status(400).json({ message: "Invalid peer id" });
    const peerId = peerIdParsed.data;

    if (await isBlockedBetween(user.id, peerId)) {
      return res
        .status(403)
        .json({ message: "This conversation is unavailable because one of you has blocked the other." });
    }

    if (peerId === user.id) return res.status(400).json({ message: "Invalid peer id" });

    const schema = z.object({ body: z.string().min(1).max(5000) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const peerRes = await pool.query("SELECT id FROM users WHERE id = $1", [peerId]);
    if (peerRes.rowCount === 0) return res.status(404).json({ message: "Peer not found" });

    const perm = await canSendDirectMessage(user, peerId);
    if (!perm.allowed) {
      return res.status(403).json({ message: perm.reason || "This user is not accepting direct messages." });
    }

    const insert = await pool.query(
      "INSERT INTO direct_messages (sender_user_id, recipient_user_id, body) VALUES ($1, $2, $3) RETURNING id, created_at",
      [user.id, peerId, parsed.data.body]
    );

    return res.status(201).json({ messageId: insert.rows[0]?.id, createdAt: insert.rows[0]?.created_at });
  })
);


app.get(
  "/v1/volunteer/history/summary",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const completed = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM request_applications
       WHERE volunteer_user_id = $1 AND status = 'completed'`,
      [user.id]
    );

    const impact = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(hours), 0)::float AS hours
       FROM volunteer_impact_entries
       WHERE volunteer_user_id = $1`,
      [user.id]
    );

    const tasks = await pool.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(duration_hours), 0)::float AS hours
       FROM volunteer_task_entries
       WHERE volunteer_user_id = $1`,
      [user.id]
    );

    const outcomes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM volunteer_outcome_entries
       WHERE volunteer_user_id = $1`,
      [user.id]
    );

    const totalHours = Number(impact.rows[0]?.hours || 0) + Number(tasks.rows[0]?.hours || 0);

    return res.json({
      completed_count: completed.rows[0]?.count ?? 0,
      impact_count: impact.rows[0]?.count ?? 0,
      tasks_count: tasks.rows[0]?.count ?? 0,
      outcomes_count: outcomes.rows[0]?.count ?? 0,
      total_hours: totalHours
    });
  })
);

app.get(
  "/v1/volunteer/history/completed",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        a.id AS application_id,
        a.status,
        a.updated_at,
        o.id AS request_id,
        o.title,
        COALESCE(o.location_text, '') AS location,
        COALESCE(o.mode, 'remote') AS mode,
        org.name AS organization_name,
        o.requester_user_id AS requester_user_id,
        o.tags
      FROM request_applications a
      JOIN service_requests o ON o.id = a.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE a.volunteer_user_id = $1 AND a.status = 'completed'
      ORDER BY a.updated_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.get(
  "/v1/volunteer/history/impact",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        e.id,
        e.impact_date,
        e.hours,
        e.notes,
        e.request_id,
        e.request_application_id,
        o.title,
        org.name AS organization_name
      FROM volunteer_impact_entries e
      LEFT JOIN service_requests o ON o.id = e.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE e.volunteer_user_id = $1
      ORDER BY e.impact_date DESC, e.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/volunteer/history/impact",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const body = z
      .object({
        request_id: z.string().uuid(),
        request_application_id: z.string().uuid().optional(),
        impact_date: z.string().min(1),
        hours: z.number().min(0).max(1000),
        notes: z.string().optional()
      })
      .parse(req.body);

    await pool.query(
      `
      INSERT INTO volunteer_impact_entries
        (volunteer_user_id, request_application_id, request_id, impact_date, hours, notes)
      VALUES
        ($1, $2, $3, $4::date, $5, $6)
      `,
      [user.id, body.request_application_id ?? null, body.request_id, body.impact_date, body.hours, body.notes ?? null]
    );

    return res.status(201).json({ ok: true });
  })
);

app.get(
  "/v1/volunteer/history/tasks",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        t.id,
        t.task_date,
        t.task,
        t.duration_hours,
        t.request_id,
        t.request_application_id,
        o.title,
        org.name AS organization_name
      FROM volunteer_task_entries t
      LEFT JOIN service_requests o ON o.id = t.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE t.volunteer_user_id = $1
      ORDER BY t.task_date DESC, t.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/volunteer/history/tasks",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const body = z
      .object({
        request_id: z.string().uuid(),
        request_application_id: z.string().uuid().optional(),
        task_date: z.string().min(1),
        task: z.string().min(1).max(500),
        duration_hours: z.number().min(0).max(1000)
      })
      .parse(req.body);

    await pool.query(
      `
      INSERT INTO volunteer_task_entries
        (volunteer_user_id, request_application_id, request_id, task_date, task, duration_hours)
      VALUES
        ($1, $2, $3, $4::date, $5, $6)
      `,
      [user.id, body.request_application_id ?? null, body.request_id, body.task_date, body.task, body.duration_hours]
    );

    return res.status(201).json({ ok: true });
  })
);

app.get(
  "/v1/volunteer/history/outcomes",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        o2.id,
        o2.outcome_date,
        o2.outcome,
        o2.quantity,
        o2.unit,
        o2.request_id,
        o2.request_application_id,
        o.title,
        org.name AS organization_name
      FROM volunteer_outcome_entries o2
      LEFT JOIN service_requests o ON o.id = o2.request_id
      LEFT JOIN organizations org ON org.slug = o.requester_org_slug
      WHERE o2.volunteer_user_id = $1
      ORDER BY o2.outcome_date DESC, o2.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/volunteer/history/outcomes",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const body = z
      .object({
        request_id: z.string().uuid(),
        request_application_id: z.string().uuid().optional(),
        outcome_date: z.string().min(1),
        outcome: z.string().min(1).max(800),
        quantity: z.number().optional(),
        unit: z.string().optional()
      })
      .parse(req.body);

    await pool.query(
      `
      INSERT INTO volunteer_outcome_entries
        (volunteer_user_id, request_application_id, request_id, outcome_date, outcome, quantity, unit)
      VALUES
        ($1, $2, $3, $4::date, $5, $6, $7)
      `,
      [
        user.id,
        body.request_application_id ?? null,
        body.request_id,
        body.outcome_date,
        body.outcome,
        body.quantity ?? null,
        body.unit ?? null
      ]
    );

    return res.status(201).json({ ok: true });
  })
);

app.get(
  "/v1/volunteer/history/hours",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const impact = await pool.query(
      `
      SELECT
        request_id,
        COALESCE(SUM(hours), 0)::float AS hours
      FROM volunteer_impact_entries
      WHERE volunteer_user_id = $1
      GROUP BY request_id
      `,
      [user.id]
    );

    const tasks = await pool.query(
      `
      SELECT
        request_id,
        COALESCE(SUM(duration_hours), 0)::float AS hours
      FROM volunteer_task_entries
      WHERE volunteer_user_id = $1
      GROUP BY request_id
      `,
      [user.id]
    );

    const byReq = new Map<string, number>();
    const add = (reqId: string | null, hrs: number) => {
      const key = reqId ?? "unassigned";
      byReq.set(key, (byReq.get(key) || 0) + Number(hrs || 0));
    };

    for (const r of impact.rows) add(r.request_id, r.hours);
    for (const r of tasks.rows) add(r.request_id, r.hours);

    const ids = Array.from(byReq.keys()).filter((k) => k !== "unassigned");
    const meta = ids.length
      ? await pool.query(
          `
          SELECT
            o.id AS request_id,
            o.title,
            org.name AS organization_name
          FROM service_requests o
          LEFT JOIN organizations org ON org.slug = o.requester_org_slug
          WHERE o.id = ANY($1::uuid[])
          `,
          [ids]
        )
      : { rows: [] as any[] };

    const metaMap = new Map<string, any>();
    for (const r of meta.rows) metaMap.set(r.request_id, r);

    const breakdown = Array.from(byReq.entries())
      .map(([key, hours]) => {
        if (key === "unassigned") {
          return { request_id: null, title: "Unassigned", organization_name: null, hours };
        }
        const m = metaMap.get(key);
        return { request_id: key, title: m?.title ?? "Unknown", organization_name: m?.organization_name ?? null, hours };
      })
      .sort((a, b) => b.hours - a.hours);

    const total_hours = breakdown.reduce((sum, r) => sum + Number(r.hours || 0), 0);

    return res.json({ total_hours, breakdown });
  })
);


app.get(
  "/v1/volunteer/history/reviews",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        vr.id,
        vr.rating,
        vr.strengths,
        vr.improvements,
        vr.would_work_again,
        vr.created_at,
        vr.request_id,
        vr.request_application_id,
        r.title AS request_title,
        org.name AS organization_name,
        COALESCE(p.display_name, p.full_name, u.email, 'Unknown') AS reviewer_name
      FROM volunteer_reviews vr
      LEFT JOIN service_requests r ON r.id = vr.request_id
      LEFT JOIN organizations org ON org.slug = r.requester_org_slug
      LEFT JOIN users u ON u.id = vr.reviewer_user_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE vr.volunteer_user_id = $1
      ORDER BY vr.created_at DESC
      `,
      [user.id]
    );

    const avg = rows.rows.length
      ? rows.rows.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / rows.rows.length
      : 0;

    return res.json({ average_rating: avg, count: rows.rows.length, reviews: illustrateRows(rows.rows) });
  })
);

function illustrateRows(rows: any[]) {
  // Strip any driver-specific metadata + ensure stable keys
  return rows.map((r) => ({
    id: r.id,
    rating: Number(r.rating || 0),
    strengths: r.strengths ?? null,
    improvements: r.improvements ?? null,
    would_work_again: typeof r.would_work_again === "boolean" ? r.would_work_again : null,
    created_at: r.created_at,
    request_id: r.request_id ?? null,
    request_application_id: r.request_application_id ?? null,
    request_title: r.request_title ?? null,
    organization_name: r.organization_name ?? null,
    reviewer_name: r.reviewer_name ?? "Unknown"
  }));
}


app.get(
  "/v1/volunteer/history/badges",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    const flag = await pool.query("SELECT enabled FROM feature_flags WHERE key = 'badges'");
    const enabled = Boolean(flag.rows[0]?.enabled);

    if (!enabled) {
      return res.json({
        enabled: false,
        badges: [],
        milestones: [],
        message:
          "Badges are currently disabled. An admin can enable them by setting feature_flags.enabled=true where key='badges'."
      });
    }

    const seenRes = await pool.query("SELECT last_seen_at FROM volunteer_badge_state WHERE volunteer_user_id = $1", [user.id]);
    const lastSeen = seenRes.rows[0]?.last_seen_at ? new Date(seenRes.rows[0].last_seen_at) : new Date(0);

    const [completed, hours, reviews] = await Promise.all([
      pool.query(
        `SELECT updated_at FROM request_applications WHERE volunteer_user_id = $1 AND status='completed' ORDER BY updated_at ASC`,
        [user.id]
      ),
      pool.query(
        `
        SELECT d, hrs FROM (
          SELECT impact_date::date AS d, COALESCE(hours,0)::float AS hrs
          FROM volunteer_impact_entries
          WHERE volunteer_user_id = $1
          UNION ALL
          SELECT task_date::date AS d, COALESCE(duration_hours,0)::float AS hrs
          FROM volunteer_task_entries
          WHERE volunteer_user_id = $1
        ) x
        WHERE d IS NOT NULL
        ORDER BY d ASC
        `,
        [user.id]
      ),
      pool.query(`SELECT rating, created_at FROM volunteer_reviews WHERE volunteer_user_id = $1 ORDER BY created_at ASC`, [user.id])
    ]);

    const completedDates = (completed.rows || []).map((r: any) => new Date(r.updated_at).toISOString());
    const completedCount = completedDates.length;

    const earnedAtCompletion = (n: number) => (completedDates.length >= n ? completedDates[n - 1] : null);

    const hourEvents = (hours.rows || []).map((r: any) => ({ d: r.d ? String(r.d) : null, hrs: Number(r.hrs || 0) }));
    let cumulative = 0;
    const hourEarnedAt: Record<number, string | null> = { 10: null, 25: null, 50: null, 100: null };
    for (const ev of hourEvents) {
      cumulative += ev.hrs;
      for (const threshold of Object.keys(hourEarnedAt).map((k) => Number(k))) {
        if (hourEarnedAt[threshold] == null && cumulative >= threshold && ev.d) {
          hourEarnedAt[threshold] = new Date(ev.d).toISOString();
        }
      }
    }

    const reviewCount = (reviews.rows || []).length;
    const avgRating =
      reviewCount > 0 ? reviews.rows.reduce((s: number, r: any) => s + Number(r.rating || 0), 0) / reviewCount : 0;

    const badges = [
      {
        id: "first_completion",
        title: "First completed opportunity",
        description: "Complete your first engagement.",
        earned: completedCount >= 1,
        earned_at: earnedAtCompletion(1),
        progress: completedCount,
        goal: 1
      },
      {
        id: "five_completions",
        title: "5 completed opportunities",
        description: "Complete five engagements.",
        earned: completedCount >= 5,
        earned_at: earnedAtCompletion(5),
        progress: completedCount,
        goal: 5
      },
      {
        id: "ten_hours",
        title: "10 volunteer hours",
        description: "Log at least 10 total hours (impact + tasks).",
        earned: cumulative >= 10,
        earned_at: hourEarnedAt[10],
        progress: cumulative,
        goal: 10
      },
      {
        id: "twentyfive_hours",
        title: "25 volunteer hours",
        description: "Log at least 25 total hours (impact + tasks).",
        earned: cumulative >= 25,
        earned_at: hourEarnedAt[25],
        progress: cumulative,
        goal: 25
      },
      {
        id: "ten_reviews",
        title: "10 reviews received",
        description: "Receive 10 reviews from requesters.",
        earned: reviewCount >= 10,
        earned_at: reviewCount >= 10 ? new Date(reviews.rows[9].created_at).toISOString() : null,
        progress: reviewCount,
        goal: 10
      }
    ].map((b) => ({
      ...b,
      is_new: b.earned && b.earned_at ? new Date(b.earned_at) > lastSeen : false
    }));

    // Persist earned badges so the UI can highlight "New" reliably.
    const earnedBadges = badges.filter((b) => b.earned);
    for (const b of earnedBadges) {
      const earnedAt = b.earned_at ? new Date(b.earned_at) : new Date();
      await pool.query(
        `
        INSERT INTO volunteer_badge_awards (volunteer_user_id, badge_id, earned_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (volunteer_user_id, badge_id)
        DO UPDATE SET earned_at = LEAST(volunteer_badge_awards.earned_at, EXCLUDED.earned_at)
        `,
        [user.id, b.id, earnedAt.toISOString()]
      );
    }

    const milestones = [
      { id: "completed", label: "Completed opportunities", value: completedCount },
      { id: "hours", label: "Total hours", value: cumulative },
      { id: "reviews", label: "Reviews received", value: reviewCount },
      { id: "avg_rating", label: "Average rating", value: avgRating }
    ];

    return res.json({ enabled: true, badges, milestones, last_seen_at: lastSeen.toISOString() });
  })
);

app.post(
  "/v1/volunteer/history/badges/seen",
  wrap(async (req, res) => {
    const user = await requireVolunteerUser(req, res);
    if (!user) return;

    await pool.query(
      `
      INSERT INTO volunteer_badge_state (volunteer_user_id, last_seen_at)
      VALUES ($1, NOW())
      ON CONFLICT (volunteer_user_id) DO UPDATE SET last_seen_at = NOW()
      `,
      [user.id]
    );

    return res.json({ ok: true });
  })
);






// ------------------------------------------------------------
// Shared Settings (All logged-in users): Blocked users + Reports filed
// ------------------------------------------------------------


// ------------------------------------------------------------
// Shared Settings (All logged-in users): Notifications Center
// ------------------------------------------------------------

type NotificationItem = {
  id: string;
  type: "message" | "new_application" | "application_update" | "review_received";
  created_at: string;
  seen: boolean;
  title: string;
  body: string;
  href: string | null;
};


async function getNotificationLastSeen(userId: string): Promise<Date> {
  const r = await pool.query("SELECT last_seen_at FROM user_notification_state WHERE user_id = $1", [userId]);
  if ((r.rowCount ?? 0) === 0 || !r.rows[0]?.last_seen_at) return new Date(0);
  return new Date(r.rows[0].last_seen_at);
}

async function setNotificationLastSeenNow(userId: string) {
  await pool.query(
    `
    INSERT INTO user_notification_state (user_id, last_seen_at)
    VALUES ($1, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
    `,
    [userId]
  );
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.min(max, Math.max(min, i));
}

function formatStatus(s: string | null) {
  if (!s) return "Update";
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

app.get(
  "/v1/settings/notifications",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const limit = clampInt((req.query as any)?.limit, 50, 1, 200);
    const lastSeen = await getNotificationLastSeen(user.id);

    const rows = await pool.query(
      `
      SELECT * FROM (
        -- Messages received (all roles)
        SELECT
          'message'::text AS type,
          dm.id::text AS source_id,
          dm.created_at::timestamptz AS created_at,
          dm.sender_user_id::text AS actor_id,
          COALESCE(p.display_name, p.full_name, su.email) AS actor_name,
          LEFT(dm.body, 220) AS body_preview,
          NULL::text AS request_id,
          NULL::text AS request_title,
          NULL::text AS application_id,
          NULL::text AS application_status,
          NULL::int AS rating
        FROM direct_messages dm
        JOIN users su ON su.id = dm.sender_user_id
        LEFT JOIN user_profiles p ON p.user_id = dm.sender_user_id
        WHERE dm.recipient_user_id = $1

        UNION ALL

        -- New applications (requesters)
        SELECT
          'new_application'::text AS type,
          a.id::text AS source_id,
          a.created_at::timestamptz AS created_at,
          a.volunteer_user_id::text AS actor_id,
          COALESCE(vp.display_name, vp.full_name, vu.email) AS actor_name,
          LEFT(COALESCE(a.message, ''), 220) AS body_preview,
          r.id::text AS request_id,
          r.title::text AS request_title,
          NULL::text AS application_id,
          NULL::text AS application_status,
          NULL::int AS rating
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        JOIN users vu ON vu.id = a.volunteer_user_id
        LEFT JOIN user_profiles vp ON vp.user_id = a.volunteer_user_id
        WHERE $2 = 'requester' AND r.requester_user_id = $1

        UNION ALL

        -- Application status updates (volunteers)
        SELECT
          'application_update'::text AS type,
          a.id::text AS source_id,
          a.updated_at::timestamptz AS created_at,
          r.requester_user_id::text AS actor_id,
          COALESCE(rp.display_name, rp.full_name, ru.email) AS actor_name,
          NULL::text AS body_preview,
          r.id::text AS request_id,
          r.title::text AS request_title,
          a.id::text AS application_id,
          a.status::text AS application_status,
          NULL::int AS rating
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        JOIN users ru ON ru.id = r.requester_user_id
        LEFT JOIN user_profiles rp ON rp.user_id = r.requester_user_id
        WHERE $2 = 'volunteer'
          AND a.volunteer_user_id = $1
          AND a.updated_at IS NOT NULL
          AND a.updated_at > a.created_at
          AND COALESCE(a.status, 'pending') <> 'pending'

        UNION ALL

        -- Reviews received (volunteer)
        SELECT
          'review_received'::text AS type,
          vr.id::text AS source_id,
          vr.created_at::timestamptz AS created_at,
          vr.reviewer_user_id::text AS actor_id,
          COALESCE(pp.display_name, pp.full_name, pu.email) AS actor_name,
          LEFT(COALESCE(vr.strengths, ''), 220) AS body_preview,
          vr.request_id::text AS request_id,
          sr.title::text AS request_title,
          NULL::text AS application_id,
          NULL::text AS application_status,
          vr.rating::int AS rating
        FROM volunteer_reviews vr
        LEFT JOIN users pu ON pu.id = vr.reviewer_user_id
        LEFT JOIN user_profiles pp ON pp.user_id = vr.reviewer_user_id
        LEFT JOIN service_requests sr ON sr.id = vr.request_id
        WHERE $2 = 'volunteer' AND vr.volunteer_user_id = $1

        UNION ALL

        -- Reviews received (requester)
        SELECT
          'review_received'::text AS type,
          rr.id::text AS source_id,
          rr.created_at::timestamptz AS created_at,
          rr.reviewer_user_id::text AS actor_id,
          COALESCE(pp.display_name, pp.full_name, pu.email) AS actor_name,
          LEFT(COALESCE(rr.strengths, ''), 220) AS body_preview,
          rr.request_id::text AS request_id,
          sr.title::text AS request_title,
          NULL::text AS application_id,
          NULL::text AS application_status,
          rr.rating::int AS rating
        FROM requester_reviews rr
        LEFT JOIN users pu ON pu.id = rr.reviewer_user_id
        LEFT JOIN user_profiles pp ON pp.user_id = rr.reviewer_user_id
        LEFT JOIN service_requests sr ON sr.id = rr.request_id
        WHERE $2 = 'requester' AND rr.requester_user_id = $1
      ) n
      ORDER BY created_at DESC
      LIMIT $3
      `,
      [user.id, user.role, limit]
    );

    const notifications: NotificationItem[] = (rows.rows as any[]).map((r: any) => {
      const createdAtIso = new Date(r.created_at).toISOString();
      const seen = new Date(r.created_at).getTime() <= lastSeen.getTime();

      if (r.type === 'message') {
        const who = r.actor_name || 'Someone';
        return {
          id: `message:${r.source_id}`,
          type: 'message',
          created_at: createdAtIso,
          seen,
          title: `New message from ${who}`,
          body: (r.body_preview || '').trim() || 'You received a new message.',
          href: user.role === 'volunteer'
            ? `/volunteer/messages/${r.actor_id}`
            : user.role === 'requester'
              ? `/requester/messages/${r.actor_id}`
              : null
        };
      }

      if (r.type === 'new_application') {
        const who = r.actor_name || 'A volunteer';
        const reqTitle = r.request_title || 'your request';
        return {
          id: `new_application:${r.source_id}`,
          type: 'new_application',
          created_at: createdAtIso,
          seen,
          title: `New application from ${who}`,
          body: `For: ${reqTitle}`,
          href: r.request_id ? `/requester/requests/${r.request_id}/applications` : '/requester/requests'
        };
      }

      if (r.type === 'application_update') {
        const who = r.actor_name || 'Requester';
        const reqTitle = r.request_title || 'a request';
        const label = formatStatus(r.application_status);
        return {
          id: `application_update:${r.source_id}:${r.application_status || ''}`,
          type: 'application_update',
          created_at: createdAtIso,
          seen,
          title: `Application update: ${label}`,
          body: `${reqTitle} • from ${who}`,
          href: r.application_id ? `/volunteer/applications/${r.application_id}` : '/volunteer/applications'
        };
      }

      // review_received
      const who = r.actor_name || 'Someone';
      const reqTitle = r.request_title || 'a request';
      const stars = typeof r.rating === 'number' ? ` (${r.rating}/5)` : '';
      return {
        id: `review_received:${r.source_id}`,
        type: 'review_received',
        created_at: createdAtIso,
        seen,
        title: `Review received from ${who}${stars}`,
        body: `For: ${reqTitle}`,
        href: user.role === 'volunteer' ? '/volunteer/history/reviews' : '/requester/reputation/reviews'
      };
    });

    const unseenCount = notifications.reduce((acc, n) => acc + (n.seen ? 0 : 1), 0);

    return res.json({ last_seen_at: lastSeen.toISOString(), unseen_count: unseenCount, notifications });
  })
);

app.get(
  "/v1/settings/notifications/unseen-count",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const lastSeen = await getNotificationLastSeen(user.id);

    const counts = await pool.query(
      `
      SELECT COUNT(1)::int AS c FROM (
        SELECT dm.created_at AS created_at
        FROM direct_messages dm
        WHERE dm.recipient_user_id = $1

        UNION ALL

        SELECT a.created_at AS created_at
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE $2 = 'requester' AND r.requester_user_id = $1

        UNION ALL

        SELECT a.updated_at AS created_at
        FROM request_applications a
        WHERE $2 = 'volunteer'
          AND a.volunteer_user_id = $1
          AND a.updated_at IS NOT NULL
          AND a.updated_at > a.created_at
          AND COALESCE(a.status, 'pending') <> 'pending'

        UNION ALL

        SELECT vr.created_at AS created_at
        FROM volunteer_reviews vr
        WHERE $2 = 'volunteer' AND vr.volunteer_user_id = $1

        UNION ALL

        SELECT rr.created_at AS created_at
        FROM requester_reviews rr
        WHERE $2 = 'requester' AND rr.requester_user_id = $1
      ) n
      WHERE n.created_at > $3
      `,
      [user.id, user.role, lastSeen.toISOString()]
    );

    return res.json({ unseen_count: counts.rows?.[0]?.c ?? 0 });
  })
);

app.post(
  "/v1/settings/notifications/mark-all-seen",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    await setNotificationLastSeenNow(user.id);
    return res.json({ ok: true });
  })
);


// ------------------------------------------------------------
// Shared Settings (All logged-in users): Privacy & Safety
// ------------------------------------------------------------

app.get(
  "/v1/settings/privacy-safety",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const existing = await pool.query(
      `
      SELECT
        public_profile_visible,
        messaging_permission,
        updated_at
      FROM user_privacy_settings
      WHERE user_id = $1
      `,
      [user.id]
    );

    if ((existing.rowCount ?? 0) === 0) {
      const ins = await pool.query(
        `
        INSERT INTO user_privacy_settings (user_id)
        VALUES ($1)
        RETURNING public_profile_visible, messaging_permission, updated_at
        `,
        [user.id]
      );
      return res.json(ins.rows[0]);
    }

    return res.json(existing.rows[0]);
  })
);

app.post(
  "/v1/settings/privacy-safety",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const schema = z.object({
      public_profile_visible: z.boolean(),
      messaging_permission: z.enum(["anyone", "verified_only", "no_one"])
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const upsert = await pool.query(
      `
      INSERT INTO user_privacy_settings (user_id, public_profile_visible, messaging_permission, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        public_profile_visible = EXCLUDED.public_profile_visible,
        messaging_permission = EXCLUDED.messaging_permission,
        updated_at = NOW()
      RETURNING public_profile_visible, messaging_permission, updated_at
      `,
      [user.id, parsed.data.public_profile_visible, parsed.data.messaging_permission]
    );

    return res.json(upsert.rows[0]);
  })
);


app.get(
  "/v1/settings/reportables",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const peersRes = await pool.query(
      `
      WITH dm_peers AS (
        SELECT DISTINCT
          CASE WHEN sender_user_id = $1 THEN recipient_user_id ELSE sender_user_id END AS peer_id
        FROM direct_messages
        WHERE sender_user_id = $1 OR recipient_user_id = $1
      ),
      app_peers AS (
        -- Peers from applications (volunteer ↔ requester)
        SELECT DISTINCT r.requester_user_id AS peer_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.volunteer_user_id = $1

        UNION

        SELECT DISTINCT a.volunteer_user_id AS peer_id
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE r.requester_user_id = $1
      ),
      peers AS (
        SELECT peer_id FROM dm_peers
        UNION
        SELECT peer_id FROM app_peers
      )
      SELECT
        u.id,
        u.email,
        COALESCE(p.display_name, p.full_name, u.email) AS display_name,
        p.avatar_url,
        COALESCE(p.public_location, p.location) AS public_location
      FROM peers x
      JOIN users u ON u.id = x.peer_id
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id <> $1
      ORDER BY display_name ASC NULLS LAST, email ASC
      LIMIT 100
      `,
      [user.id]
    );

    const requestsRes = await pool.query(
      `
      WITH as_requester AS (
        SELECT r.id, r.title, r.created_at, 'requester'::text AS role
        FROM service_requests r
        WHERE r.requester_user_id = $1
      ),
      as_volunteer AS (
        SELECT DISTINCT r.id, r.title, r.created_at, 'volunteer'::text AS role
        FROM request_applications a
        JOIN service_requests r ON r.id = a.request_id
        WHERE a.volunteer_user_id = $1
      ),
      all_reqs AS (
        SELECT * FROM as_requester
        UNION
        SELECT * FROM as_volunteer
      )
      SELECT
        r.id,
        r.title,
        r.created_at,
        r.role,
        org.name AS organization_name
      FROM all_reqs r
      LEFT JOIN service_requests sr ON sr.id = r.id
      LEFT JOIN organizations org ON org.slug = sr.requester_org_slug
      ORDER BY r.created_at DESC
      LIMIT 100
      `,
      [user.id]
    );

    return res.json({
      peers: peersRes.rows,
      requests: requestsRes.rows
    });
  })
);

app.get(
  "/v1/settings/blocked-users",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        b.blocked_user_id,
        b.reason,
        b.created_at AS blocked_at,
        u.email AS blocked_email,
        COALESCE(p.display_name, p.full_name, u.email) AS blocked_display_name,
        p.avatar_url AS blocked_avatar_url,
        COALESCE(p.public_location, p.location) AS blocked_public_location
      FROM user_blocks b
      JOIN users u ON u.id = b.blocked_user_id
      LEFT JOIN user_profiles p ON p.user_id = b.blocked_user_id
      WHERE b.blocker_user_id = $1
      ORDER BY b.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/settings/blocked-users",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const schema = z.object({
      blocked_user_id: z.string().uuid().optional(),
      email: z.string().email().optional(),
      reason: z.string().max(5000).optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const reason = (parsed.data.reason || "").trim() || null;

    let blockedUserId = parsed.data.blocked_user_id ?? null;

    if (!blockedUserId && parsed.data.email) {
      const email = parsed.data.email.toLowerCase().trim();
      const u = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (u.rowCount === 0) return res.status(404).json({ message: "User not found" });
      blockedUserId = String(u.rows[0].id);
    }

    if (!blockedUserId) return res.status(400).json({ message: "Choose a user or provide an email." });
    if (blockedUserId === user.id) return res.status(400).json({ message: "You can't block yourself." });

    const insert = await pool.query(
      `
      INSERT INTO user_blocks (blocker_user_id, blocked_user_id, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (blocker_user_id, blocked_user_id)
      DO UPDATE SET reason = EXCLUDED.reason
      RETURNING blocked_user_id, reason, created_at AS blocked_at
      `,
      [user.id, blockedUserId, reason]
    );

    return res.status(201).json(insert.rows[0]);
  })
);

app.delete(
  "/v1/settings/blocked-users/:blockedUserId",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const parsed = z.string().uuid().safeParse(req.params.blockedUserId);
    if (!parsed.success) return res.status(400).json({ message: "Invalid blocked user id" });

    await pool.query("DELETE FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2", [user.id, parsed.data]);

    return res.json({ ok: true });
  })
);

app.get(
  "/v1/settings/reports",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const rows = await pool.query(
      `
      SELECT
        r.id,
        r.category,
        r.details,
        r.status,
        r.created_at,
        r.updated_at,
        r.resolved_at,

        r.target_user_id,
        tu.email AS target_user_email,
        COALESCE(tup.display_name, tup.full_name, tu.email) AS target_user_display_name,

        r.target_request_id,
        sr.title AS target_request_title,
        org.name AS target_request_org_name
      FROM user_reports r
      LEFT JOIN users tu ON tu.id = r.target_user_id
      LEFT JOIN user_profiles tup ON tup.user_id = r.target_user_id
      LEFT JOIN service_requests sr ON sr.id = r.target_request_id
      LEFT JOIN organizations org ON org.slug = sr.requester_org_slug
      WHERE r.reporter_user_id = $1
      ORDER BY r.created_at DESC
      `,
      [user.id]
    );

    return res.json(rows.rows);
  })
);

app.post(
  "/v1/settings/reports",
  wrap(async (req, res) => {
    const user = await requireAuthedUser(req, res);
    if (!user) return;

    const schema = z.object({
      target_type: z.enum(["user", "request", "other"]),
      target_user_id: z.string().uuid().optional(),
      target_request_id: z.string().uuid().optional(),
      category: z.enum(["harassment", "spam", "scam", "safety", "hate", "sexual", "other"]),
      details: z.string().min(10).max(10000)
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });

    const targetType = parsed.data.target_type;

    const targetUserId = targetType === "user" ? parsed.data.target_user_id ?? null : null;
    const targetRequestId = targetType === "request" ? parsed.data.target_request_id ?? null : null;

    if (targetType === "user" && !targetUserId) {
      return res.status(400).json({ message: "Choose a user to report." });
    }
    if (targetType === "request" && !targetRequestId) {
      return res.status(400).json({ message: "Choose a request to report." });
    }

    if (targetUserId) {
      const u = await pool.query("SELECT id FROM users WHERE id = $1", [targetUserId]);
      if (u.rowCount === 0) return res.status(404).json({ message: "Target user not found" });
      if (String(targetUserId) === user.id) return res.status(400).json({ message: "You can't report yourself." });
    }

    if (targetRequestId) {
      const r = await pool.query("SELECT id FROM service_requests WHERE id = $1", [targetRequestId]);
      if (r.rowCount === 0) return res.status(404).json({ message: "Target request not found" });
    }

    const insert = await pool.query(
      `
      INSERT INTO user_reports (reporter_user_id, target_user_id, target_request_id, category, details, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'submitted', NOW(), NOW())
      RETURNING id, category, details, status, created_at, updated_at, target_user_id, target_request_id
      `,
      [user.id, targetUserId, targetRequestId, parsed.data.category, parsed.data.details]
    );

    return res.status(201).json(insert.rows[0]);
  })
);

registerOrgRoutes(app, pool, wrap);
registerAdminRoutes(app, pool, wrap);

/**
 * Distance features read only what is already geocoded. A missing user location is geocoded in
 * the background so the next request can use it; the request itself never waits on Nominatim.
 */
async function cachedUserGeo(userId: string) {
  const geo = await ensureUserGeo(pool, userId, { allowFetch: false }).catch(() => null);
  if (!geo) void ensureUserGeo(pool, userId).catch(() => null);
  return geo;
}

function startGeoBackfill() {
  if (process.env.GEOCODING_DISABLED === "true") return;
  const run = () => backfillRecentServiceRequestGeo(pool, { limit: 15 }).catch(() => null);
  setTimeout(run, 10_000).unref();
  setInterval(run, 10 * 60_000).unref();
}

async function start() {
  const pending = await pendingMigrations(migrationPool);
  if (pending.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[ThankYou API] ${pending.length} pending migration(s): ${pending.join(", ")}. Run \`pnpm db:migrate\` first.`);
    process.exit(1);
  }
  startGeoBackfill();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[ThankYou API] listening on http://localhost:${port}`);
  });
}

start().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[ThankYou API] Failed to start", e);
  process.exit(1);
});
