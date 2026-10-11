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
