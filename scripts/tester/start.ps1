# Volunteer Services - start the app for testing and open it in the browser.
. (Join-Path $PSScriptRoot "common.ps1")
Refresh-Path
if (-not (Test-Path "apps\api\.env")) { Fail "Volunteer Services isn't set up on this computer yet. Run 'Set up Volunteer Services' first." }
Ensure-Postgres

if ((Port-InUse 3202) -and (Port-InUse 4202)) {
  Ok "Volunteer Services is already running"
} else {
  if ((Port-InUse 3202) -or (Port-InUse 4202)) { Fail "Something else is using port 3202 or 4202. Close other 'Volunteer Services server' windows (or restart the computer) and try again." }
  Say "Starting Volunteer Services. A window called 'Volunteer Services server' opens: keep it open while you test (emails appear there)."
  $cmd = "`$host.UI.RawUI.WindowTitle = 'Volunteer Services server - keep this window open while testing'; Set-Location '$Root'; pnpm dev"
  Start-Process powershell -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd
  Say "Waiting for the app to be ready (the first start can take a minute or two)..."
  if (-not (Wait-ForSite "http://localhost:4202/v1/platform/status" 180)) { Fail "The server didn't start. Look at the 'Volunteer Services server' window for a red error message." }
  if (-not (Wait-ForSite "http://localhost:3202/" 240)) { Fail "The web app didn't start. Look at the 'Volunteer Services server' window for a red error message." }
}

Start-Process "http://localhost:3202/"
$tracker = Join-Path $Root "docs\uat\uat-tracker.html"
if (Test-Path $tracker) { Start-Process $tracker }
Write-Host ""
Write-Host "  Volunteer Services is running at http://localhost:3202" -ForegroundColor Green
Write-Host "  Every test account's password is Password!  (see 'How to test' in the UAT tracker)." -ForegroundColor Green
Write-Host "  To stop: close the 'Volunteer Services server' window." -ForegroundColor Gray
