$ErrorActionPreference = "Stop"

$DB = $env:DATABASE_URL_MIGRATIONS
if (-not $DB) { $DB = $env:DATABASE_URL }
if (-not $DB) {
  Write-Error "DATABASE_URL_MIGRATIONS or DATABASE_URL is required"
  exit 1
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
psql "$DB" -v ON_ERROR_STOP=1 -f (Join-Path $scriptDir "apply_sharing_schema.sql")
Write-Host "Sharing schema applied."
