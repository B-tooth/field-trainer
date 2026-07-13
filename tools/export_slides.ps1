param(
  [Parameter(Mandatory=$true)][string]$PowerPointPath,
  [Parameter(Mandatory=$true)][string]$OutputFolder
)
$ErrorActionPreference = "Stop"
$powerPoint = $null
$presentation = $null
try {
  New-Item -ItemType Directory -Force -Path $OutputFolder | Out-Null
  Get-ChildItem -Path $OutputFolder -Filter "slide-*.png" -ErrorAction SilentlyContinue | Remove-Item -Force
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Open((Resolve-Path $PowerPointPath), $true, $false, $false)
  $presentation.Export((Resolve-Path $OutputFolder), "PNG")
  $presentation.Close()
  $presentation = $null
  $powerPoint.Quit()
  $powerPoint = $null

  $files = Get-ChildItem -Path $OutputFolder -Filter "*.PNG" | Sort-Object {
    if ($_.BaseName -match '(\d+)$') { [int]$Matches[1] } else { 999999 }
  }
  $number = 1
  foreach ($file in $files) {
    $destination = Join-Path $OutputFolder ("slide-{0}.png" -f $number)
    if ($file.FullName -ne $destination) { Move-Item -Force $file.FullName $destination }
    $number++
  }
} finally {
  if ($presentation) { $presentation.Close() }
  if ($powerPoint) { $powerPoint.Quit() }
  [System.GC]::Collect()
  [System.GC]::WaitForPendingFinalizers()
}
