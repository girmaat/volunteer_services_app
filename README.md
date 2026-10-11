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
| Dual-role user (volunteer today; requester role added in Phase 4) | dual.role@thankyou.test |

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | API + web in watch mode (API applies pending migrations first) |
| `pnpm check` | typecheck + lint + tests for every package |
| `pnpm build` | production build of every package |
| `pnpm db:migrate` | apply pending migrations |
| `pnpm --filter @thankyou/api db:status` | list applied / pending migrations |
| `pnpm db:seed` | (re)seed test data; safe to run repeatedly |
| `pnpm db:reset` | drop and rebuild the local database, then seed (refuses in production) |

## Tests

```bash
pnpm test        # API: unit + integration (~1,200 tests, ~25 s)
```

API integration tests need a local Postgres. They create and reset a database named `thankyou_test`
on the same server as your `DATABASE_URL` (override with `TEST_DATABASE_URL`) — never your development database.
The Postgres user needs permission to create that database once (`CREATE DATABASE thankyou_test OWNER <user>;`).

The suite includes three sweeps over **every** route: anonymous and forged-token callers get 401,
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
