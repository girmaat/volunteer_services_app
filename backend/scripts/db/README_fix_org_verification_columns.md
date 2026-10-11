# Fix: missing organizations.verification_required (and related columns)

## Why you're seeing the error
With `RUN_MIGRATIONS=false`, the backend skips `ensureDbSchema()`. Your DB therefore may not have the
organization verification columns that admin routes query (e.g. `organizations.verification_required`).

Backend logs look like:
- `column "verification_required" does not exist`

This script adds the missing organization columns idempotently.

## Run (PowerShell)
1) Set an *admin/owner* Postgres connection string (NOT the limited runtime role):

```powershell
$env:DATABASE_URL_ADMIN="postgres://postgres:<PASSWORD>@localhost:5433/thankyou"
```

2) Apply:

```powershell
psql $env:DATABASE_URL_ADMIN -f backend/scripts/db/apply_org_verification_columns.sql
```

3) Restart backend:
```powershell
cd backend
npm run dev
```

## Run (macOS/Linux)
```bash
export DATABASE_URL_ADMIN='postgres://postgres:<PASSWORD>@localhost:5433/thankyou'
psql "$DATABASE_URL_ADMIN" -f backend/scripts/db/apply_org_verification_columns.sql
```

## Notes
- Safe to run multiple times.
- This does not re-enable migrations; it just brings your schema up to date for the admin verification endpoints.
