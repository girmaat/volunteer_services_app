# ThankYou

A volunteer-services marketplace: organizations and individuals post needs, volunteers find and apply, both sides coordinate, complete and review.

```
apps/web            Next.js 15 (App Router) web app            → http://localhost:3002
apps/api            Express + Postgres REST API (/v1)          → http://localhost:4000
packages/contracts  Shared zod schemas and types (web ⇄ api)
packages/config     Shared runtime config (API base URLs)
docs/               Plans, progress log, runbooks
```

## Prerequisites

- **Node.js 22** (see `.nvmrc`) and **pnpm 10**: `corepack enable` once, then `pnpm -v`.
- **PostgreSQL 14+** running locally (the original app used `localhost:5433`). No Docker required.

## First run

```bash
pnpm install

# API config
cp apps/api/.env.example apps/api/.env        # then set DATABASE_URL (database name: thankyou_next)
# Web config
cp apps/web/.env.example apps/web/.env.local

pnpm db:setup     # creates the database if missing, applies migrations, seeds test accounts
pnpm dev          # runs API (4000) and web (3002) together
```

Open http://localhost:3002.

### Seeded test accounts

All seeded accounts share one password: the value of `SEED_PASSWORD`, or **`ThankYou-Local-2026!`** locally when it isn't set.
Seed data is for local/staging only; the seed script refuses to run in production.

| Persona | Email |
| --- | --- |
| Platform admin (super) | admin@thankyou.test |
| Organization admin (Harbor Food Bank, Bright Futures Tutoring) | org.admin@thankyou.test |
| Organization team member | org.member@thankyou.test |
| In-person volunteer (has car, 15 mi) | volunteer.local@thankyou.test |
| Remote volunteer (tutoring, Spanish) | volunteer.remote@thankyou.test |
| Individual requester | requester@thankyou.test |
| Dual-role user (volunteer and requester) | dual.role@thankyou.test |
| Moderator (works queues, can't change settings) | moderator@thankyou.test |

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | API + web in watch mode (API applies pending migrations first) |
| `pnpm check` | typecheck + lint + tests + the web→API route check |
| `pnpm e2e` | the UAT scripts U1–U15 and the accessibility sweep (needs the stack running) |
| `pnpm check:api-calls` | fails if the web app calls an API route that doesn't exist |
| `pnpm --filter @thankyou/api perf:check` | adds 1,000 requests, times Recommended/Discovery (budget 300 ms), removes them |
| `pnpm build` | production build of every package |
| `pnpm db:migrate` | apply pending migrations |
| `pnpm --filter @thankyou/api db:status` | list applied / pending migrations |
| `pnpm db:seed` | (re)seed test data; safe to run repeatedly |
| `pnpm db:reset` | drop and rebuild the local database, then seed (refuses in production) |

## Tests

```bash
pnpm test        # API: unit + integration (~1,600 tests, ~50 s)
pnpm e2e         # Playwright: U1–U15 + accessibility, against http://localhost:3002
```

API integration tests need a local Postgres. They create and reset a database named `thankyou_test`
on the same server as your `DATABASE_URL` (override with `TEST_DATABASE_URL`) — never your development database.
The Postgres user needs permission to create that database once (`CREATE DATABASE thankyou_test OWNER <user>;`).

### End-to-end (UAT scripts)

`e2e/` has one Playwright spec per UAT script (U1–U15) plus an axe + 375 px sweep of the UAT pages.
Start the stack first (`pnpm build && pnpm --filter @thankyou/api start` and `pnpm --filter @thankyou/web start`,
or `pnpm dev`), with a seeded database and, in `apps/api/.env`, `DEV_EMAIL_LINKS=true` and
`AUTH_RATE_LIMIT_PER_MINUTE=60` (the suite signs up and logs in several users from one IP).
Specs create their own users and requests with unique names, so they can run again and again on the same database.
Other targets: `E2E_BASE_URL`, `E2E_API_URL`, `E2E_DATABASE_URL`. First time: `pnpm exec playwright install chromium`.

The API suite includes three sweeps over **every** route: anonymous and forged-token callers get 401,
volunteers can't reach admin/org routes, and no route answers 500 for any role.

## API documentation

With the API running: http://localhost:4000/v1/docs (OpenAPI JSON at `/v1/openapi.json`).

## Database migrations

Migrations are plain SQL files in `apps/api/migrations/NNNN_description.sql`, applied in order, each in a transaction, recorded in `schema_migrations`.
`0001_baseline.sql` is the schema the original app built at startup. A database created by the original app is adopted automatically (baseline marked as applied).
To change the schema, add the next numbered file; never edit an applied one.

## Repository conventions

- Retired files are moved to `.retired/` (git-ignored) rather than deleted.
- Secrets live only in `.env` / `.env.local` (git-ignored). Examples are committed.
- CI (`.github/workflows/ci.yml`) runs install → audit → typecheck → lint → migrate → test → build.

See `docs/PROGRESS.md` for what has changed phase by phase.
