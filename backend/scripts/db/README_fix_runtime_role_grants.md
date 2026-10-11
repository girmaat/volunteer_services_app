# Fix enforcement permissions for runtime DB role

## Why you're seeing the error
Your backend is running with a limited runtime DB user (e.g. `thankyou_app`) and `RUN_MIGRATIONS=false`.
The enforcement page hits admin endpoints that read `public.user_enforcement_actions`. Postgres is currently
returning:

`permission denied for table user_enforcement_actions`

This script grants the **minimum required** privileges to the runtime role and sets default privileges (optional)
so future tables created by the schema owner will be readable/writable by the runtime role.

## Run (PowerShell)

From repo root:

```powershell
$env:DATABASE_URL_ADMIN="postgres://postgres:<PASSWORD>@localhost:5433/thankyou"

# runtime role used by backend DATABASE_URL
$runtimeRole="thankyou_app"

# schema owner role (the role that creates tables, e.g. thankyou)
$ownerRole="thankyou"

psql $env:DATABASE_URL_ADMIN -v runtime_role=$runtimeRole -v owner_role=$ownerRole -f backend/scripts/db/fix_runtime_role_grants.sql
```

Then restart backend and refresh `/admin/enforcement`.

## Run (bash)

```bash
export DATABASE_URL_ADMIN='postgres://postgres:<PASSWORD>@localhost:5433/thankyou'
psql "$DATABASE_URL_ADMIN" -v runtime_role=thankyou_app -v owner_role=thankyou -f backend/scripts/db/fix_runtime_role_grants.sql
```

## Notes
- The script also creates `user_enforcement_actions` if it doesn't exist (idempotent).
- It grants `USAGE, SELECT` on all sequences in `public` because `bigserial`/`serial` inserts need it.
