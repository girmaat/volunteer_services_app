-- Fix runtime role grants for ALL tables/sequences in public schema.
-- Usage (repo root):
--   psql "$DATABASE_URL_ADMIN" -v runtime_role=thankyou_app -v owner_role=thankyou -f backend/scripts/db/fix_runtime_role_grants.sql

\set ON_ERROR_STOP on

\if :{?runtime_role}
\else
  \echo 'ERROR: missing -v runtime_role=<role>'
  \quit 1
\endif

\if :{?owner_role}
\else
  \set owner_role ''
\endif

BEGIN;

GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";

COMMIT;

\if :owner_role <> ''
  ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
  ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"runtime_role";
\endif

\echo 'OK: runtime_role privileges updated.'
