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
