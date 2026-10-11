# Progress log — Plan to UAT and Production

Each phase is one or more commits on `main` in this repository (`Thank-you-App/thankyou-next`).
The original app in `Thank-you-App/thankyou` is untouched.

## Phase 0 — Stabilize the repo (done 2026-10-10)

- Baseline commit: the original app at 22f492f plus all uncommitted work, minus `node_modules`, `.next`, `.env` and generated code dumps.
- pnpm workspace: `apps/web`, `apps/api`, `packages/contracts`, `packages/config` (was `helpers/`).
- Correct `.gitignore`; dependency lockfile committed (`pnpm-lock.yaml`); old npm lockfiles, legacy DB scripts, `docs/NextSteps.txt` (contained passwords) and code-dump scripts moved to `.retired/`.
- **Security upgrades:** Next 14.2.5 → 15.5.27 and React 18 → 19 (Next 14 has unpatched critical advisories); nodemailer 6 → 10; multer 1 → 2; postcss pinned ≥ 8.5.18. `pnpm audit --prod`: no known vulnerabilities.
  Next 15 async request APIs migrated with the official codemod plus manual fixes.
- Fonts self-hosted (Inter + Plus Jakarta Sans); builds no longer fetch Google Fonts.
- Migrations: dependency-free SQL runner (`apps/api/src/db/migrator.ts`), `0001_baseline.sql` generated from the legacy `ensureDbSchema()`; the API no longer alters the schema at startup and refuses to start with pending migrations.
- `pnpm db:setup` (create DB → migrate → seed); idempotent seed with 7 personas, 2 orgs, 20 requests.
- ESLint (api + web), Prettier, EditorConfig, `.nvmrc`, CI workflow, README.
- Verified: typecheck, lint (warnings only), tests, production build, API boot + login, and every main page for each role returns 200 on the new stack.

## Phase 1 — Critical fixes and performance quick wins (done 2026-10-10)

**Security**
- Account takeover closed: verification/reset links are returned to the browser only when `NODE_ENV != production` **and** `DEV_EMAIL_LINKS=true`; the forgot-password page no longer accepts a link from the URL. Forgot-password and resend-verification responses are identical for known and unknown emails.
- Email transport is explicit (`EMAIL_TRANSPORT=log|smtp|disabled`); local default prints emails to the API console.
- Download file names are sanitised (RFC 5987 `Content-Disposition`) in all three download routes.
- Logout is POST-only; session cookies are `Secure` in production; login `returnTo` hardened against `/\evil.com` open redirects.
- Public org website links limited to http(s); public profiles no longer fall back to full names or legacy precise locations.

**Bugs**
- `/v1/public/*` no longer requires sign-in; public pages show real, redacted listings to visitors (home, opportunities list + detail, organizations list + profile). Lists are paginated (`{ items, nextCursor }`) with search and mode filters.
- Org directory no longer blocked by share-link moderation; requesters/org admins are no longer bounced away from Organizations.
- Public location now prefers the request's own area (was showing the org's area).
- Recommended/Nearby feeds were failing in SQL ("could not determine data type of parameter $5") and silently returned fallbacks; fixed.
- Home page copy said "GiveBack" (migration 0002) and crashed if CMS content was missing (now falls back).

**Performance**
- `getCurrentUser`/`getOrgContext` cached per request (was 2–3 `/v1/me` calls per page).
- Root layout no longer reads cookies → Home, About, Terms, Privacy, Help, How it works, Trust & Safety, Code of Conduct, Contact, Examples, Organizations and Impact Stories are static/ISR.
- Middleware maintenance check cached for 30 s (was a backend call on every navigation).
- Geocoding moved off the request path, throttled to 1 req/s, failures cached for 7 days; background backfill every 10 minutes.
- `backendFetch`: one base URL, 8 s timeout (was sequential multi-host retries).
- Volunteer dashboard: 6 sequential queries → 1; requester dashboard parallelised.
- Loading skeletons for volunteer, requester, org, admin and settings areas.

**Measured locally (1,020 open requests):** recommended 40–70 ms, nearby 10–18 ms, remote 20–31 ms, public list 8 ms; signed-in dashboard = `/v1/me` + 1 data call (+ maintenance check at most every 30 s).

**Found, scheduled for Phase 2:** the contact form discards messages (`/v1/public/contact` stores nothing); org website/URL fields aren't validated on write.

## Phase 2 — Backend restructure, API contract and hardening (done 2026-10-10)

**Structure** — `server.ts` (5,800 lines) is now a 50-line entrypoint. Routes live in `src/modules/<area>/*.routes.ts`
(platform, public, auth, share, volunteer, requester, settings, org, admin, safety), each file ≤ ~650 lines;
shared code in `src/lib` (env, db, logger, errors, http, pagination, redaction, clientIp) and `src/middleware`
(auth, rateLimit). Generated mechanically with the TypeScript compiler API so handler bodies are unchanged.
Dead code removed: two unregistered volunteer-history modules, a legacy `/v1/org/enroll` stub, duplicate
messaging-permission helpers, the legacy `opportunities` table family (migration 0003).

**Contract** — `packages/contracts` holds zod schemas for public, auth and common types; OpenAPI 3.1 is
generated at `/v1/openapi.json` (Redoc at `/v1/docs`, off in production unless `EXPOSE_API_DOCS=true`) and
lists all 168 paths / 192 operations, with full schemas for public and auth endpoints.

**Hardening**
- Validated configuration (`lib/env.ts`): the API refuses to start in production without SMTP, https
  `WEB_BASE_URL`, etc.
- helmet (strict CSP for a JSON API), CORS allow-list, 1 MB body limit, `x-powered-by` off.
- Rate limits: login/signup/reset 10/min per IP and 10/15 min per email; public forms 10/10 min; writes 120/min.
  The web server forwards the visitor IP with a shared secret (`INTERNAL_API_KEY`) so limits apply per visitor,
  not per web server; spoofed `X-Forwarded-For` is no longer trusted for share-report thresholds.
- Central error handler with `{ error: { code, message }, message, requestId }`; DB constraint errors map to
  404/409/400 instead of 500. pino structured logs with request ids and secret redaction.
- Session lookup returns an explicit column list (internal admin notes no longer reach `/v1/me`);
  malformed session tokens return 401 instead of 500.
- `http(s)`-only URL validation for org website/logo and avatars (`z.string().url()` accepted `javascript:`).
- Other users' emails/full names no longer used as display-name fallbacks (19 queries); blocked-user lists
  no longer show the blocked person's email.
- Background jobs with pg-boss (geocoding, scheduled backfill); graceful shutdown; production bundle via esbuild.

**Bugs found by the new tests and fixed**
- Both review endpoints always failed (`ON CONFLICT` didn't match the partial unique index).
- Org application decisions (waitlist/accept via PATCH) always failed ("column reference status is ambiguous").
- Admin maintenance-mode toggle always failed (unused SQL parameter).
- Admin strike/ban/grant on an unknown user returned 500 (now 404).
- Settings overview called two endpoints that didn't exist (`blocked-users/count`, `reports/count`).
- The contact form discarded messages (now stored in `contact_messages` and emailed to `SUPPORT_EMAIL`).

**Tests** — 1,229 API tests (unit + integration on a real Postgres): auth-guard sweep over every private route
(anonymous + forged token), role-separation sweep, a no-500 sweep for every route × 4 roles, an `ON CONFLICT`
index check, and functional tests for public browsing, sign-up → verify → login → reset, the request → apply →
accept → message → complete → review loop, blocking, feeds, org decisions, admin and settings.

**Still open for Phase 4:** volunteer/peer emails are visible to requesters and orgs before acceptance
(spec: reveal after match), messaging has no masking or expiry.

## Phase 3 — Design system, navigation and redesign (2026-10-11)

**Brand and tokens** — deep teal primary (`#0f6e66`), sunflower (`#f2b630`) reserved for focus, active and
verified states, warm neutrals (ink `#17242f`, paper `#fafaf8`, lines `#e3e1dc`/`#cfccc5`). Plus Jakarta Sans for
headings, Inter for body, both self-hosted (no request to Google at build or run time). New logo: a speech-bubble
heart with a sunflower dot. No gradients, glass or decorative shadows anywhere; the old auth gradient is gone.
Tailwind 3.4 maps every utility to the CSS variables (preflight off so existing CSS modules keep working);
legacy variable names (`--bg`, `--accent`, `--card` …) alias the new tokens so un-restyled pages inherit the look.

**Components** (`components/ui`) — Button/ButtonLink, Input/Textarea/Select/Field, Card, PageHeader, EmptyState,
Notice, Badge, VerifiedBadge, StatusPill (one colour per status everywhere), LinkTabs, StatStrip.
Radix primitives for the user menu and dialogs; lucide icons.

**Navigation** — one model (`components/shell/nav.ts`) drives everything:
- Public pages: marketing header (Opportunities, Organizations, How it works, Log in, Sign up) and a four-column footer.
- Signed-in areas: an app shell with a left sidebar on desktop and a bottom tab bar on mobile; the user menu holds
  profile, settings, context switching and log out. Five old nav components retired.
- `/dashboard` is now only a router to the right home; old entry URLs (`/volunteer`, `/requester`, `/org`,
  `/org/enroll`, `/volunteer/saved` …) are permanent redirects.

**Redesigned screens** — home (search + "Open right now" board), opportunity browse (filter rail + rows),
organizations list/detail, volunteer/requester/org dashboards, org applicants (status filters, accept / waitlist /
decline in place), volunteer applications (active / past), login, signup, password reset, onboarding.

**SEO and metadata** — per-page titles/descriptions, `sitemap.xml`, `robots.txt` (no indexing unless
`NEXT_PUBLIC_ALLOW_INDEXING=true`), schema.org `JobPosting` (VOLUNTEER) on opportunity pages, security headers.

**Accessibility** — axe-core (WCAG 2.1 A/AA + best practice) on 30 key pages across all roles: 0 serious or
critical issues remaining. Fixed: every app page now has an `h1` and no skipped heading levels (70 files);
labelled every admin filter/control; stat panels use list semantics; landmarks are uniquely labelled;
skip link; 44 px touch targets; visible sunflower focus ring. Mobile checked at 390 px.
