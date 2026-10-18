# ThankYou - one-time setup of a tester's Windows computer. Safe to run again.
# Installs what's missing (Node.js, PostgreSQL), creates the local database, writes the settings files,
# installs the app's packages, loads the test data and puts shortcuts on the desktop.
. (Join-Path $PSScriptRoot "common.ps1")

Write-Host ""
Write-Host "  ThankYou tester setup" -ForegroundColor White
Write-Host "  This takes 10-20 minutes the first time. Windows may ask 'Do you want to allow this app to make changes?' - click Yes." -ForegroundColor Gray
Write-Host ""
Refresh-Path

# 1. Node.js (runs the app) and pnpm (installs its packages)
$needNode = $true
if (Has "node") { $major = [int]((node -v).TrimStart('v').Split('.')[0]); if ($major -ge 20) { $needNode = $false } }
if ($needNode) {
  Say "[1/7] Installing Node.js..."
  Winget-Install "OpenJS.NodeJS.LTS" @()
  if (-not (Has "node")) { Fail "Node.js didn't install. Close this window, restart the computer and run setup again." }
}
Ok "Node.js $(node -v)"
if (-not (Has "pnpm")) {
  Say "      Installing pnpm..."
  npm install -g pnpm@10.28.0 | Out-Null
  Refresh-Path
  if (-not (Has "pnpm")) { Fail "pnpm didn't install." }
}
Ok "pnpm $(pnpm -v)"

# 2. PostgreSQL (the database). Installed as a Windows service that starts with the computer.
# The app's database login is the same on every computer (the developer's local settings).
$DbName = "thankyou_next"
$DbUser = "thankyou_app"
$DbPassword = "pYarsema,21"
$cfg = Read-Config
if (-not $cfg) {
  $cfg = [pscustomobject]@{ pgPort = 5433; pgSuperPassword = "ThankYouLocal-" + (New-Secret 4); internalKey = (New-Secret 24); ipSalt = (New-Secret 16); notifySecret = (New-Secret 24) }
}
$svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $svc) {
  Say "[2/7] Installing PostgreSQL (the database)..."
  if (Port-InUse 5433) { $cfg.pgPort = 5434 }
  # The generated password has no spaces or quotes, so it passes through the installer's command line safely.
  $override = "--mode unattended --unattendedmodeui none --superpassword $($cfg.pgSuperPassword) --servicepassword $($cfg.pgSuperPassword) --serverport $($cfg.pgPort)"
  Winget-Install "PostgreSQL.PostgreSQL.16" @("--override", $override)
  $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $svc) {
    Warn "Trying the latest PostgreSQL version instead..."
    Winget-Install "PostgreSQL.PostgreSQL" @("--override", $override)
    $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if (-not $svc) { Fail "PostgreSQL didn't install." }
  $cfg | Add-Member -NotePropertyName installedByScript -NotePropertyValue $true -Force
} elseif (-not $cfg.installedByScript -and -not $cfg.superPasswordKnown) {
  Warn "PostgreSQL is already installed on this computer."
  $p = Read-Host "  Type the PostgreSQL 'postgres' password chosen when it was installed"
  $port = Read-Host "  PostgreSQL port (press Enter for 5432, the usual one)"
  $cfg.pgSuperPassword = $p
  $cfg.pgPort = if ($port) { [int]$port } else { 5432 }
  $cfg | Add-Member -NotePropertyName superPasswordKnown -NotePropertyValue $true -Force
}
Save-Config $cfg
Refresh-Path
Ensure-Postgres
if (-not (Has "psql")) { Fail "Can't find psql. Restart the computer and run setup again." }
Ok "PostgreSQL on port $($cfg.pgPort)"

# 3. The app's own database and login
Say "[3/7] Creating the ThankYou database..."
$env:PGPASSWORD = $cfg.pgSuperPassword
$psql = @("-h", "localhost", "-p", "$($cfg.pgPort)", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tAc")
$role = & psql @psql "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'"
if ($LASTEXITCODE -ne 0) { Remove-Item Env:PGPASSWORD; Fail "Couldn't sign in to PostgreSQL. If PostgreSQL was already on this computer, the password typed may be wrong: delete tester.local.json and run setup again." }
if (-not $role) { & psql @psql "CREATE ROLE $DbUser LOGIN PASSWORD '$DbPassword'" | Out-Null } else { & psql @psql "ALTER ROLE $DbUser LOGIN PASSWORD '$DbPassword'" | Out-Null }
$db = & psql @psql "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if (-not $db) { & psql @psql "CREATE DATABASE $DbName OWNER $DbUser" | Out-Null }
& psql -h localhost -p "$($cfg.pgPort)" -U postgres -d $DbName -v ON_ERROR_STOP=1 -tAc "ALTER SCHEMA public OWNER TO $DbUser" | Out-Null
Remove-Item Env:PGPASSWORD
Ok "Database $DbName is ready (login $DbUser)"

# 4. Settings files (written every time so they always match this computer)
Say "[4/7] Writing settings..."
$api = Get-Content "apps\api\.env.example"
$api = $api -replace '^DATABASE_URL=.*', "DATABASE_URL=postgres://$($DbUser):$([uri]::EscapeDataString($DbPassword))@localhost:$($cfg.pgPort)/$DbName" `
            -replace '^AUTH_RATE_LIMIT_PER_MINUTE=.*', 'AUTH_RATE_LIMIT_PER_MINUTE=60' `
            -replace '^INTERNAL_API_KEY=.*', "INTERNAL_API_KEY=$($cfg.internalKey)" `
            -replace '^IP_HASH_SALT=.*', "IP_HASH_SALT=$($cfg.ipSalt)" `
            -replace '^NOTIFICATION_SECRET=.*', "NOTIFICATION_SECRET=$($cfg.notifySecret)"
Set-Content -Path "apps\api\.env" -Value $api -Encoding ASCII
$web = (Get-Content "apps\web\.env.example") -replace '^INTERNAL_API_KEY=.*', "INTERNAL_API_KEY=$($cfg.internalKey)"
Set-Content -Path "apps\web\.env.local" -Value $web -Encoding ASCII
Ok "apps\api\.env and apps\web\.env.local"

# 5. Packages
Run "[5/7] Downloading the app's packages (a few minutes)..." { pnpm install --frozen-lockfile }
Ok "Packages installed"

# 6. Test data and the UAT tracker
Run "[6/7] Loading the test data..." { pnpm db:uat }
Run "      Building the UAT tracker..." { node scripts\build-uat-tracker.mjs }
Ok "Test data loaded"

# 7. Desktop shortcuts
Say "[7/7] Adding desktop shortcuts..."
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$links = @(
  @{ name = "Start ThankYou"; file = "Start ThankYou.bat"; icon = "shell32.dll,137" },
  @{ name = "ThankYou UAT Tracker"; file = "UAT Tracker.bat"; icon = "shell32.dll,165" },
  @{ name = "Reset ThankYou test data"; file = "Reset test data.bat"; icon = "shell32.dll,238" },
  @{ name = "Update ThankYou"; file = "Update ThankYou.bat"; icon = "shell32.dll,46" }
)
foreach ($l in $links) {
  $s = $shell.CreateShortcut((Join-Path $desktop "$($l.name).lnk"))
  $s.TargetPath = Join-Path $Root "tester\$($l.file)"
  $s.WorkingDirectory = $Root
  $s.IconLocation = "$env:SystemRoot\System32\$($l.icon)"
  $s.Save()
}
Ok "Shortcuts: Start ThankYou, ThankYou UAT Tracker, Reset ThankYou test data, Update ThankYou"

Write-Host ""
Write-Host "  Setup finished." -ForegroundColor Green
Write-Host "  To test: double-click 'Start ThankYou' on the desktop. It opens the app and the UAT tracker." -ForegroundColor Green
Write-Host ""
$go = Read-Host "  Start ThankYou now? (Y/n)"
if ($go -ne "n" -and $go -ne "N") { & (Join-Path $PSScriptRoot "start.ps1") }
