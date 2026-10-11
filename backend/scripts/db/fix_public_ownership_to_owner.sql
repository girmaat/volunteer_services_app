\set ON_ERROR_STOP on

-- Reassign ownership of all objects in schema "public" to the schema owner role.
-- Usage (PowerShell):
--   psql $env:DATABASE_URL_ADMIN -v app_owner=thankyou -f backend/scripts/db/fix_public_ownership_to_owner.sql
--
-- NOTE: This file intentionally avoids PL/pgSQL DO blocks because psql variable
-- substitution does NOT occur inside dollar-quoted strings on some setups.

\if :{?app_owner}
\else
\echo 'ERROR: missing required variable app_owner. Run with: -v app_owner=thankyou'
\quit 1
\endif

\echo 'Reassigning ownership of public objects to role :' :app_owner

-- Tables
SELECT format('ALTER TABLE %I.%I OWNER TO %I;', schemaname, tablename, :'app_owner')
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec

-- Sequences
SELECT format('ALTER SEQUENCE %I.%I OWNER TO %I;', sequence_schema, sequence_name, :'app_owner')
FROM information_schema.sequences
WHERE sequence_schema = 'public'
ORDER BY sequence_name
\gexec

-- Views
SELECT format('ALTER VIEW %I.%I OWNER TO %I;', schemaname, viewname, :'app_owner')
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname
\gexec

-- Materialized views
SELECT format('ALTER MATERIALIZED VIEW %I.%I OWNER TO %I;', schemaname, matviewname, :'app_owner')
FROM pg_matviews
WHERE schemaname = 'public'
ORDER BY matviewname
\gexec

-- Functions
SELECT format(
  'ALTER FUNCTION %I.%I(%s) OWNER TO %I;',
  n.nspname,
  p.proname,
  pg_get_function_identity_arguments(p.oid),
  :'app_owner'
)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname
\gexec

-- Optional: tighten schema permissions (safe defaults)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

\echo 'Done. Ownership reassigned to :' :app_owner
