<# : batch portion
@echo off
title Volunteer Services - install for testing
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f = '%~f0'; Invoke-Expression ((Get-Content -LiteralPath $f -Raw))"
echo.
pause
exit /b
#>
# The lines above start PowerShell, which runs the rest of this file.
# ---------------------------------------------------------------------------------------------
# Volunteer Services - install for testing (Windows 10/11).
#
$RepoUrl = "https://github.com/girmaat/volunteer_services_app.git"
$RepoName = "volunteer_services_app"
#
# FOR THE TESTER: double-click this file. If Windows says "Windows protected your PC", click
# "More info" and then "Run anyway". Answer "Yes" when Windows asks for permission to install.
# You choose the folder the project goes into.
# ---------------------------------------------------------------------------------------------
$ErrorActionPreference = "Stop"

function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
function Stop-With($msg) { Write-Host ""; Write-Host "  PROBLEM: $msg" -ForegroundColor Red; Write-Host "  Take a screenshot of this window and send it to the developer." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Volunteer Services - install for testing" -ForegroundColor White
Write-Host "  This takes 15-30 minutes. Leave this window open until it says it's finished." -ForegroundColor Gray
Write-Host ""

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Stop-With "Windows Package Manager (winget) is missing. Open the Microsoft Store, install 'App Installer', then run this file again." }

# Where to put the project: the tester picks a folder (default: Documents).
$parent = $null
try {
  Add-Type -AssemblyName System.Windows.Forms
  $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
  $dlg.Description = "Choose the folder to put the Volunteer Services project in (a '$RepoName' folder is created inside it)"
  $dlg.SelectedPath = [Environment]::GetFolderPath("MyDocuments")
  $dlg.ShowNewFolderButton = $true
  Write-Host "  A window opens to choose where to put the project (it may be behind this one)." -ForegroundColor Gray
  if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $parent = $dlg.SelectedPath }
} catch {}
if (-not $parent) {
  $default = [Environment]::GetFolderPath("MyDocuments")
  $parent = Read-Host "  Folder to put the project in (press Enter for $default)"
  if (-not $parent) { $parent = $default }
}
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$Folder = Join-Path $parent $RepoName

# Git downloads the project from GitHub.
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "  Installing Git..." -ForegroundColor Cyan
  winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements
  Refresh-Path
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-With "Git didn't install. Restart the computer and run this file again." }
}

Write-Host "  Downloading Volunteer Services into $Folder ..." -ForegroundColor Cyan
Write-Host "  If a GitHub sign-in window opens, sign in with the GitHub account the developer gave access to." -ForegroundColor Gray
if (Test-Path (Join-Path $Folder ".git")) {
  git -C $Folder pull --ff-only
} else {
  git clone $RepoUrl $Folder
}
if ($LASTEXITCODE -ne 0) { Stop-With "Couldn't download the project from $RepoUrl. Check the address and that your GitHub account has access." }

& (Join-Path $Folder "scripts\tester\setup.ps1")
