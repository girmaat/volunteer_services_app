# Shared helpers for the tester scripts (Windows PowerShell 5.1 or later). ASCII only on purpose.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root
$ConfigPath = Join-Path $Root "tester.local.json"

function Say($text) { Write-Host $text -ForegroundColor Cyan }
function Ok($text) { Write-Host "  OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "  !   $text" -ForegroundColor Yellow }
function Fail($text) {
  Write-Host ""
  Write-Host "  PROBLEM: $text" -ForegroundColor Red
  Write-Host "  Take a screenshot of this window and send it to the developer." -ForegroundColor Red
  Write-Host ""
  exit 1
}

# Programs installed a moment ago are only on PATH for new windows; reload it for this one.
function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machine;$user"
  $npmGlobal = Join-Path $env:APPDATA "npm"
  if ((Test-Path $npmGlobal) -and ($env:Path -notlike "*$npmGlobal*")) { $env:Path = "$env:Path;$npmGlobal" }
  $pg = Find-PgBin
  if ($pg -and ($env:Path -notlike "*$pg*")) { $env:Path = "$env:Path;$pg" }
}

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Find-PgBin {
  $dirs = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory -ErrorAction SilentlyContinue | Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending
  foreach ($d in $dirs) { $bin = Join-Path $d.FullName "bin"; if (Test-Path (Join-Path $bin "psql.exe")) { return $bin } }
  return $null
}

function Read-Config {
  if (Test-Path $ConfigPath) { return Get-Content $ConfigPath -Raw | ConvertFrom-Json }
  return $null
}

function Save-Config($cfg) { $cfg | ConvertTo-Json | Set-Content -Path $ConfigPath -Encoding ASCII }

function New-Secret([int]$bytes = 24) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return ([BitConverter]::ToString($b) -replace '-', '').ToLower()
}

function Winget-Install($id, $extra) {
  if (-not (Has "winget")) { Fail "Windows Package Manager (winget) is missing. Install 'App Installer' from the Microsoft Store, then run this again." }
  $wargs = @("install", "--id", $id, "-e", "--silent", "--accept-package-agreements", "--accept-source-agreements") + $extra
  & winget @wargs
  # winget returns non-zero when the program is already installed; the caller checks the result itself.
  Refresh-Path
}

function Ensure-Postgres {
  $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $svc) { Fail "PostgreSQL isn't installed. Run 'Set up Volunteer Services' first." }
  if ($svc.Status -ne "Running") {
    Say "Starting the database (Windows may ask for permission)..."
    try { Start-Service $svc.Name } catch {
      Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile", "-Command", "Start-Service '$($svc.Name)'"
    }
    Start-Sleep -Seconds 3
  }
  Ok "Database is running"
}

function Port-InUse([int]$port) {
  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect("127.0.0.1", $port); $c.Close(); return $true } catch { return $false }
}

function Wait-ForSite($url, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    try { $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10; if ($r.StatusCode -lt 500) { return $true } } catch {}
    Start-Sleep -Seconds 3
  }
  return $false
}

function Run($label, [scriptblock]$block) {
  Say $label
  & $block
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { Fail "$label did not finish (exit code $LASTEXITCODE)." }
}
