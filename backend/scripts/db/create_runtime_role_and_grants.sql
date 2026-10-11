\set ON_ERROR_STOP on

-- Create a least-privilege runtime role (LOGIN) and grant it access to the app schema.
-- Usage (PowerShell):
--   psql $env:DATABASE_URL_ADMIN ^
--     -v runtime_user=thankyou_app ^
--     -v runtime_pass=change_me ^
--     -v dbname=thankyou ^
--     -v schema=public ^
--     -v owner_role=thankyou ^
--     -f backend/scripts/db/create_runtime_role_and_grants.sql
--
-- NOTE: This file intentionally avoids PL/pgSQL DO blocks because psql variable
-- substitution does NOT occur inside dollar-quoted strings on some setups.

\if :{?runtime_user}
\else
\set runtime_user thankyou_app
\endif

\if :{?schema}
\else
\set schema public
\endif

\if :{?owner_role}
\else
\set owner_role thankyou
\endif

\if :{?dbname}
\else
SELECT current_database() AS dbname \gset
\endif

\if :{?runtime_pass}
\else
\echo 'ERROR: missing required variable runtime_pass. Provide with: -v runtime_pass=...'
\quit 1
\endif

\echo 'Ensuring runtime role exists: :' :runtime_user
SELECT 1 AS role_exists FROM pg_roles WHERE rolname = :'runtime_user';
\gset
\if :{?role_exists}
\echo 'Role already exists.'
\else
CREATE ROLE :"runtime_user" LOGIN;
\endif

-- Always set/rotate password to the provided value
ALTER ROLE :"runtime_user" WITH LOGIN PASSWORD :'runtime_pass';

-- DB-level permissions
GRANT CONNECT ON DATABASE :"dbname" TO :"runtime_user";

-- Schema-level permissions
GRANT USAGE ON SCHEMA :"schema" TO :"runtime_user";

-- Object permissions (existing)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA :"schema" TO :"runtime_user";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA :"schema" TO :"runtime_user";

-- Future objects created by the schema owner role
ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA :"schema"
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_user";

ALTER DEFAULT PRIVILEGES FOR ROLE :"owner_role" IN SCHEMA :"schema"
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"runtime_user";

\echo 'Done. Runtime role :' :runtime_user ' has least-privilege grants on schema :' :schema
