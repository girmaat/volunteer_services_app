# Admin schema bootstrap (when RUN_MIGRATIONS=false)

This repo supports **two** ways to keep your local DB schema up to date:

## Option A (recommended for local dev): Let the backend run schema ensure
Set `RUN_MIGRATIONS=true` (or remove it entirely — `true` is the default). The backend will run `ensureDbSchema()` on startup using `DATABASE_URL_MIGRATIONS` (or `DATABASE_URL` if the migrations URL is not set).

This mode prevents common “missing table/column” errors such as:
- `column "slug" does not exist`
- `relation "platform_settings" does not exist`

> Note: If your runtime DB user is a limited role (e.g. `thankyou_app`) and you hit `permission denied` errors on newly-created tables, run the grant helper once:
> `backend/scripts/db/fix_runtime_role_grants.sql` (see `README_fix_runtime_role_grants.md`).

## Option B (hardened / production-like): Keep RUN_MIGRATIONS=false
If you run the backend with `RUN_MIGRATIONS=false`, the backend will **not** create new tables automatically on startup.
That’s expected (it’s part of the hardened DB-role design). In that mode, you must apply new schema once using an admin/owner connection.

Symptoms when the admin schema is missing:
- Admin dashboard shows `—` for several tiles, and backend logs show `relation "platform_settings" does not exist`
  or `relation "org_incident_reports" does not exist`.

## 1) Set admin connection string

PowerShell (Windows):

```powershell
$env:DATABASE_URL_ADMIN="postgres://postgres:<PASSWORD>@localhost:5433/thankyou"
```

bash/zsh:

```bash
export DATABASE_URL_ADMIN='postgres://postgres:<PASSWORD>@localhost:5433/thankyou'
```

## 2) Apply the admin/moderation schema (idempotent)

From repo root:

PowerShell:

```powershell
ps1\backend\scripts\db\apply_admin_moderation_schema.ps1 -RuntimeRole thankyou_app
```

Or directly:

```powershell
psql $env:DATABASE_URL_ADMIN -v runtime_role=thankyou_app -f backend/scripts/db/apply_admin_moderation_schema.sql
```

bash/zsh:

```bash
bash backend/scripts/db/apply_admin_moderation_schema.sh thankyou_app
# or:
psql "$DATABASE_URL_ADMIN" -v runtime_role=thankyou_app -f backend/scripts/db/apply_admin_moderation_schema.sql
```

## 3) Restart backend + refresh /admin

After this, `/admin` should populate counts (Users/New users/Organizations/Reports/Incidents/etc.) and Maintenance Mode controls should become enabled.
