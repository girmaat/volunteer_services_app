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

**Phase 3 gaps closed (2026-10-11)**
- UI kit completed: IconButton, Checkbox, Radio/RadioGroup, Avatar, Skeleton, Table/Th/Td, Pagination,
  Modal and Sheet (Radix Dialog), Toast, SubmitButton (disables itself while its form is sending).
- 580 static inline `style={{…}}` replaced with design-token classes by a codemod (colour intent kept:
  red/green/amber boxes map to danger/success/warning tints). Five remain and are legitimately dynamic
  (chart geometry, bottom-bar column count, the select chevron); Open Graph images need inline styles.
- Org Home shows a "Finish setting up" checklist (contact, profile, verification, teammate, first request)
  until every step is done; onboarding is no longer a nav item.
- Phones: opportunity filters fold behind a "Filters" link (works without JavaScript) so results come first;
  the signed-in header uses an avatar menu, so no page scrolls sideways at 375 px.
- SEO: canonical URLs on every public page; PNG Open Graph images (site default and per opportunity).
- Verified: Lighthouse accessibility **100** on all 13 UAT pages; axe: 0 serious/critical on the same pages;
  no horizontal scroll at 375 px (both checked in the E2E suite).

## Phase 4 — Core features to spec (2026-10-11)

4.1 **One account, many roles** — `user_roles`, `sessions.active_context`, context switcher at the top of the
sidebar (Volunteering · Requesting help · each org · Platform admin); one `can(user, action)` policy replaces the
role checks; Settings → Roles adds a role by reusing the onboarding steps; moderator platform role.
4.2 **Request model + wizard** — five steps (Basics → When → Where → Requirements → Review), draft saved per step,
emergency banner, categories with posting/applying trust tiers, sensitive categories go to review. The wizard
posts each step as a plain form (full page load), and editing a live request saves per step ("Save changes" / "Done").
4.3 **Lifecycle** — `transitionRequest()` with a transition table, an audit row per change, waitlist
auto-promotion, owner actions shown only when valid.
4.4 **Discovery** — `/v1/discovery/opportunities`: full-text search, filters (category, mode, skills, distance,
dates incl. "this weekend", verified orgs), opaque cursor; match score with reasons ("3 of 4 skills · 6 mi ·
fits your Saturdays"); tabs Recommended · Near you · Remote · Saved; times shown in the viewer's zone.
4.5 **Location privacy** — public area only until acceptance; exact address only to the owner and accepted
volunteers. Phone numbers, emails and links in request text are masked until acceptance too.
4.6 **Messaging** — one conversation per request + volunteer; SSE live updates with polling fallback; masking
before acceptance; report / block / end in the thread; attachments (type-sniffed, 5 MB); per-user and
first-contact limits; scam phrases and new-account links held for review; auto-archive 14 days after completion.
4.7 **Reviews** — structured, double-blind (visible when both submit or after 14 days); late cancellation and
no-show recorded on the commitment and shown as reliability; disputes.
4.8 **Notifications** — in-app bell + HTML/text email for every event in the plan; 48 h / 2 h attendance
reminders; per-type preferences; one-click unsubscribe (List-Unsubscribe); message emails at most hourly.
4.9 **Admin minimum** — moderation queues per category, take-down with reason, fill-rate and volume metrics,
`admin_audit_log` written by every admin mutation (readable action names), shadow-ban, disputes;
super admins can run a scheduled job now (`POST /v1/admin/jobs/:name/run`, audited).

Also added in this pass: ICS download for a commitment (the link existed, the endpoint didn't); completed
work counts toward impact hours; org check-in / check-out from the applicants list.

**Done-when: U1–U15 pass end to end** — `e2e/` holds a Playwright spec per UAT script plus an accessibility
sweep (18 tests). Green **twice in a row** locally against a production build; CI runs them on every push
(`e2e` job). Writing them found and fixed: org onboarding called two API routes that didn't exist (new orgs could
never finish onboarding), Settings → change password had no API route, the org documents page always 404'd,
emails were treated as links and held, and a client-navigation stall (below).

**Navigation stall (fixed)** — with an area-level `loading.tsx`, client-side navigation between nested pages
and server-action redirects stalled 15–20 % of the time in production builds (Next 15.5.27; reproduced and
bisected). The area-level loading boundaries are retired (`.retired/web-pages/loading`); nav links show a
pending spinner (`useLinkStatus`) instead. Link prefetch is off in the signed-in app (each prefetch re-rendered
layouts and called the API several times).

## Review of Phases 0–4 against the plan (2026-10-11)

| Phase | Done-when | Status |
| --- | --- | --- |
| 0 | Clean clone runs with three commands; CI green | Met (CI also runs E2E now) |
| 1 | Real data logged out; ≤ 2 backend calls per signed-in dashboard; Recommended < 300 ms with 1,000 requests; static pages cached | Met: 2 calls on volunteer, requester and org dashboards (unread count and org context ride on `/v1/me`, top picks / activity ride on the dashboard call); `pnpm --filter @thankyou/api perf:check`: Recommended p90 34 ms, Discovery p90 18 ms with 1,025 requests |
| 2 | server.ts < 100 lines; tests in < 2 min; OpenAPI lists every route; no extra columns | Met: server.ts 46 lines; 1,600 API tests in ~50 s; a test fails if any route is missing from OpenAPI |
| 3 | Lighthouse a11y ≥ 95 on UAT pages; no sideways scroll at 375 px; no serious axe issues; one nav per shell | Met (100 / 0 / 0) |
| 4 | Each UAT script passes end to end with seeded personas | Met locally (staging is Phase 5) |

**Deliberate deviations** (each is simpler now, with a path later):
- Own SQL migration runner instead of node-pg-migrate; no docker-compose (a local Postgres, per your call).
- Distance by haversine on lat/lng instead of PostGIS (fine at this scale; PostGIS when the managed DB exists).
- Attachments stored in Postgres until S3 in Phase 5; the virus-scan hook only knows the EICAR test string.
- Fonts: Plus Jakarta Sans + Inter instead of IBM Plex. Static pages revalidate every 300 s, not 3,600 s.
- No area-level loading skeletons (see the navigation stall above).

**Still open from Phases 0–4** (none blocks UAT; listed so nothing is hidden):
- Phase 2 item 13 — `any`: 408 uses remain in 31 files that carry a file-level lint disable. New code is typed;
  these files need a typing pass.
- Phase 2 item 8 — cursor pagination is on public, discovery, notification and inbox lists; other lists are
  bounded (LIMIT) and admin lists use page numbers.
- Phase 2 item 12 — the wizard, reviews and inbox forms validate with the shared contracts; older forms
  (org settings, admin) still rely on the API's validation for errors.
- Dev-only audit findings: `braces` (via eslint-config-next, no fix published) and `postcss-selector-parser`
  (via Tailwind 3). Production dependencies: no known vulnerabilities.

## UX pass: onboarding, org sign-up, notifications, Impact (2026-10-11)

1. **Sign-up / onboarding is a short stepper** (`/onboarding?step=role|about|interests|schedule|needs`).
   Radio cards for "help / need a hand / organization", chips for kinds of help, skills and causes,
   the time zone pre-set from the browser, Sat/Sun pre-picked, only the name required. Interests can be
   skipped. It ends on `/onboarding/welcome`: four recommended opportunities (volunteers) or an
   "Ask for help" start (requesters) instead of an empty dashboard. The header shows "Finish setting up"
   until it's done.
2. **Org sign-up is one form** (organization name, what it does, city; your name, work email,
   password). The address (slug) is generated from the name and the contact email defaults to yours.
   Verifying lands on a single "Finish setting up {org}" page, prefilled, then Org Home with a welcome
   toast. Signed-in people can start or join an organization from `/org/signup`; a volunteer who starts
   one keeps volunteering. Org admins and invited teammates are no longer left with onboarding marked
   incomplete. The old `/org/onboarding/admin` and `/organization` URLs redirect.
3. **Notifications**: the bell opens a panel with the latest eight, unread dots, "Mark all read" and
   "See all". `/notifications` has All/Unread, Today/Yesterday/This week/Earlier groups and "Show
   older". Every item opens through `/notifications/open/:id`, which marks it read and deep-links to
   the thing it is about (new `GET /v1/notifications/:id`). Settings → Notifications is now only the
   email/in-app preferences.
4. **Impact is one page** (`/volunteer/history`): totals, a timeline of completed work, an optional
   note or corrected hours on each item, badges with progress to the next one, reviews, CSV export
   and Share. New `GET /v1/volunteer/impact`. Hours come from one place (`modules/volunteer/impact.ts`):
   logged hours for an engagement replace the scheduled estimate instead of adding to it, so the page,
   the summary, badges and the CSV agree (the CSV used to count both). The old tab URLs redirect to
   the matching section.
5. Small fixes found on the way: distances are rounded ("3.1 mi", "under a mile" — the dashboard
   showed 3.132485859088846 mi); the verify-email redirect read the wrong `/v1/me` shape and sent org
   admins to volunteer onboarding.

Checks: 1,616 API tests pass (new: impact totals/notes/CSV, notification detail, org slug generation,
volunteer starting an org); 18 E2E tests pass on two consecutive runs, updated for the new flows; the
axe/375 px gate now also covers `/org/signup`, the onboarding steps, `/onboarding/welcome`,
`/notifications`, `/volunteer/history` and `/org/onboarding`. Replaced files are copied to `.retired/`.
