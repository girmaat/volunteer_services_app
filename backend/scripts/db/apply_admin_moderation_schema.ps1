Param(
  [string]$RuntimeRole = "thankyou_app"
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL_ADMIN) {
  Write-Host "ERROR: DATABASE_URL_ADMIN is not set." -ForegroundColor Red
  Write-Host "Example:"
  Write-Host '  $env:DATABASE_URL_ADMIN="postgres://postgres:<PASSWORD>@localhost:5433/thankyou"'
  exit 1
}

$scriptPath = Join-Path $PSScriptRoot "apply_admin_moderation_schema.sql"

Write-Host "Applying admin/moderation schema using DATABASE_URL_ADMIN..." -ForegroundColor Cyan
psql $env:DATABASE_URL_ADMIN -v runtime_role=$RuntimeRole -f $scriptPath
Write-Host "Done." -ForegroundColor Green
