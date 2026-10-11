# DB hardening scripts (owner + runtime role)

These scripts support the pattern:
- one **schema owner** role (e.g. `thankyou`) that owns tables and runs migrations
- one **runtime** role (e.g. `thankyou_app`) that has only DML privileges

## 1) Fix table ownership (one-time)
Run as a superuser (or current owner of the objects), passing the schema owner role:

PowerShell:
  $env:DATABASE_URL_ADMIN="postgres://postgres:<PASSWORD>@localhost:5433/thankyou"
  psql $env:DATABASE_URL_ADMIN -v app_owner=thankyou -f backend/scripts/db/fix_public_ownership_to_owner.sql

This resolves startup crashes like:
  must be owner of table impact_stories

## 2) Create runtime role + grants
Run as a superuser (or a role allowed to CREATE ROLE and GRANT), passing a password:

PowerShell:
  psql $env:DATABASE_URL_ADMIN `
    -v runtime_user=thankyou_app `
    -v runtime_pass=change_me_now `
    -v dbname=thankyou `
    -v schema=public `
    -v owner_role=thankyou `
    -f backend/scripts/db/create_runtime_role_and_grants.sql

## 3) App env settings (recommended)
- Runtime (least privilege):
  DATABASE_URL=postgres://thankyou_app:<PASS>@localhost:5433/thankyou
  RUN_MIGRATIONS=false

- Migrations / owner:
  DATABASE_URL_MIGRATIONS=postgres://thankyou:<PASS>@localhost:5433/thankyou
  RUN_MIGRATIONS=true  (only in a migration job / local dev when you intend to migrate)

Restart the backend after changing env vars.
