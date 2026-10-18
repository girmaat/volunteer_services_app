# ThankYou - put the test data back to its starting point (all test accounts and ready-made situations).
. (Join-Path $PSScriptRoot "common.ps1")
Refresh-Path
Write-Host ""
Write-Host "  This wipes everything done in the app so far (accounts you created, applications, messages...)" -ForegroundColor Yellow
Write-Host "  and loads the starting test data again. Your results in the UAT tracker are NOT affected." -ForegroundColor Yellow
$ok = Read-Host "  Continue? (y/N)"
if ($ok -ne "y" -and $ok -ne "Y") { Write-Host "  Nothing changed."; exit 0 }
Ensure-Postgres
Run "Loading the starting test data..." { pnpm db:uat }
Write-Host ""
Write-Host "  Done. Refresh the browser. If ThankYou was running, close the 'ThankYou server' window and start it again" -ForegroundColor Green
Write-Host "  so no page shows old data." -ForegroundColor Green
