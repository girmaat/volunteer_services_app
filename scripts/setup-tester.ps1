# ThankYou — one-time setup for a tester's Windows laptop.
# Run from the project folder in PowerShell:   powershell -ExecutionPolicy Bypass -File scripts\setup-tester.ps1
# Needs: Node.js 22 (nodejs.org) and PostgreSQL 16 (postgresql.org), installed first.
# Safe to run again: it keeps existing .env files and only re-creates the test data.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Write-Host "Missing: $cmd. $hint" -ForegroundColor Red; exit 1 }
}
Need node "Install Node.js 22 LTS from https://nodejs.org, then open a new PowerShell window."
Need psql "Install PostgreSQL 16 from https://www.postgresql.org/download/windows/ and add its bin folder (e.g. C:\Program Files\PostgreSQL\16\bin) to PATH."

$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { Write-Host "Node $((node -v)) is too old; install Node 22." -ForegroundColor Red; exit 1 }

# pnpm comes with Node through corepack.
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) { corepack enable; corepack prepare pnpm@10.28.0 --activate }

# Database: port, superuser password, and an app account.
$pgPort = Read-Host "PostgreSQL port (press Enter for 5432)"; if (-not $pgPort) { $pgPort = "5432" }
$pgSuper = Read-Host "PostgreSQL superuser password (the one chosen when installing PostgreSQL)" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgSuper))
$appPass = "thankyou_local_pw"

$exists = psql -h localhost -p $pgPort -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='thankyou_app'"
if (-not $exists) { psql -h localhost -p $pgPort -U postgres -c "CREATE ROLE thankyou_app LOGIN PASSWORD '$appPass';" | Out-Null }
$db = psql -h localhost -p $pgPort -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='thankyou_next'"
if (-not $db) { psql -h localhost -p $pgPort -U postgres -c "CREATE DATABASE thankyou_next OWNER thankyou_app;" | Out-Null }
psql -h localhost -p $pgPort -U postgres -d thankyou_next -c "ALTER SCHEMA public OWNER TO thankyou_app;" | Out-Null
Remove-Item Env:PGPASSWORD

# Config files (kept if they already exist).
if (-not (Test-Path apps\api\.env)) {
  (Get-Content apps\api\.env.example) `
    -replace '^DATABASE_URL=.*', "DATABASE_URL=postgres://thankyou_app:$appPass@localhost:$pgPort/thankyou_next" `
    -replace '^AUTH_RATE_LIMIT_PER_MINUTE=.*', 'AUTH_RATE_LIMIT_PER_MINUTE=60' | Set-Content apps\api\.env
}
if (-not (Test-Path apps\web\.env.local)) { Copy-Item apps\web\.env.example apps\web\.env.local }

pnpm install
pnpm db:uat

Write-Host ""
Write-Host "Setup done. Start the app with:  pnpm dev" -ForegroundColor Green
Write-Host "Then open http://localhost:3202 and sign in with any seed user (password: Password!)."
Write-Host "Test cases: docs\uat\README.md"
