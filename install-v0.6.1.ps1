$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $projectRoot "backup-v0.6.1-$timestamp"

New-Item -ItemType Directory -Path "$backup\app\js" -Force | Out-Null
New-Item -ItemType Directory -Path "$backup\app\css" -Force | Out-Null

Copy-Item "$projectRoot\app\index.html" "$backup\app\index.html" -Force
Copy-Item "$projectRoot\app\js\app.js" "$backup\app\js\app.js" -Force
Copy-Item "$projectRoot\app\css\styles.css" "$backup\app\css\styles.css" -Force

Copy-Item "$projectRoot\update-files\app\index.html" "$projectRoot\app\index.html" -Force
Copy-Item "$projectRoot\update-files\app\js\app.js" "$projectRoot\app\js\app.js" -Force
Get-Content "$projectRoot\update-files\css\zoom-completion-patch.css" |
  Add-Content "$projectRoot\app\css\styles.css"

Write-Host ""
Write-Host "Field Trainer v0.6.1 installed."
Write-Host "Backup created at: $backup"
Write-Host ""
Write-Host "Start the app with:"
Write-Host "python -m http.server 8000"
