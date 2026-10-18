# Volunteer Services - download the newest version from GitHub, update packages and reload the test data.
. (Join-Path $PSScriptRoot "common.ps1")
Refresh-Path
if ((Port-InUse 3202) -or (Port-InUse 4202)) { Fail "Volunteer Services is running. Close the 'Volunteer Services server' window first, then run Update again." }
Say "Downloading the newest version..."
git pull --ff-only
if ($LASTEXITCODE -ne 0) {
  Warn "Your copy has local changes. Saving them aside (git stash) and trying again..."
  git stash push --include-untracked -m "tester-update $(Get-Date -Format s)" | Out-Null
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) { Fail "Couldn't download the update." }
}
Ok "Code is up to date ($(git log -1 --format='%h %s'))"
# Run the setup again: it installs new packages, applies database changes, reloads test data and rebuilds the tracker.
& (Join-Path $PSScriptRoot "setup.ps1")
