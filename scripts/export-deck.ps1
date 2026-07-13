param(
  [Parameter(Mandatory=$true)]
  [string]$PowerPointFile
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path $PowerPointFile).Path
$deckFolder = Split-Path $source -Parent
$deckId = (Split-Path $deckFolder -Leaf).ToLower() -replace '[^a-z0-9_-]','_'
$deckName = [System.IO.Path]::GetFileNameWithoutExtension($source) -replace '_',' '
$deckJson = Join-Path $deckFolder 'deck.json'

Write-Host "Opening $source"
$powerpoint = New-Object -ComObject PowerPoint.Application
$powerpoint.Visible = [Microsoft.Office.Core.MsoTriState]::msoTrue
$presentation = $null

try {
  $presentation = $powerpoint.Presentations.Open($source, $true, $false, $false)

  # Remove old exported slide images so deleted slides do not remain.
  Get-ChildItem $deckFolder -Filter 'slide-*.png' -ErrorAction SilentlyContinue | Remove-Item -Force

  $cards = @()
  foreach ($slide in $presentation.Slides) {
    $number = [int]$slide.SlideIndex
    $answer = ''
    try {
      if ($slide.Shapes.HasTitle -eq [Microsoft.Office.Core.MsoTriState]::msoTrue) {
        $answer = $slide.Shapes.Title.TextFrame.TextRange.Text.Trim()
      }
    } catch {}

    if ([string]::IsNullOrWhiteSpace($answer)) {
      throw "Slide $number has no title placeholder. Add the answer using a PowerPoint Title layout."
    }

    $filename = "slide-$number.png"
    $output = Join-Path $deckFolder $filename
    $slide.Export($output, 'PNG', 1600, 900)
    $cards += [ordered]@{ id="slide-$number"; image=$filename; answer=$answer }
    Write-Host "Exported slide $number - $answer"
  }

  $manifest = [ordered]@{ id=$deckId; name=$deckName; cards=$cards }
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $deckJson

  # Rebuild the app-wide deck index from all deck.json files.
  $projectRoot = Split-Path (Split-Path $deckFolder -Parent) -Parent
  $decksRoot = Join-Path $projectRoot 'decks'
  $entries = @()
  Get-ChildItem $decksRoot -Directory | ForEach-Object {
    $manifestPath = Join-Path $_.FullName 'deck.json'
    if (Test-Path $manifestPath) {
      $m = Get-Content $manifestPath -Raw | ConvertFrom-Json
      $entries += [ordered]@{
        id=$m.id
        name=$m.name
        path="decks/$($_.Name)/deck.json"
      }
    }
  }
  [ordered]@{ decks=$entries } | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $decksRoot 'index.json')
  Write-Host "Deck ready: $deckJson"
}
finally {
  if ($presentation) { $presentation.Close() }
  $powerpoint.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint) | Out-Null
}
