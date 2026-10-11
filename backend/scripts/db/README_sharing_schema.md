# Sharing schema (Share Links + Events)

Adds tables used by tokenized share links:

- share_links
- share_events
- share_reports

These are also created automatically when `RUN_MIGRATIONS=true` because they are included in `backend/src/migrate.ts`.

## Manual apply (when RUN_MIGRATIONS is disabled)

### PowerShell
- Set a privileged connection string:
  - `$env:DATABASE_URL_MIGRATIONS="postgres://..."`
- Run:
  - `./backend/scripts/db/apply_sharing_schema.ps1`

### Bash
- `export DATABASE_URL_MIGRATIONS="postgres://..."`
- `./backend/scripts/db/apply_sharing_schema.sh`
