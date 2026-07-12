$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$www = Join-Path $root "www"
$wwwResources = Join-Path $www "resources"
$wwwResearch = Join-Path $www "research_database\exports\json"
$wwwPrivatePersonal = Join-Path $www "private-personal-data"

New-Item -ItemType Directory -Force -Path $www | Out-Null
New-Item -ItemType Directory -Force -Path $wwwResources | Out-Null
New-Item -ItemType Directory -Force -Path $wwwResearch | Out-Null

Copy-Item -LiteralPath (Join-Path $root "index.html") -Destination (Join-Path $www "index.html") -Force
Copy-Item -LiteralPath (Join-Path $root "privacy.html") -Destination (Join-Path $www "privacy.html") -Force
Copy-Item -LiteralPath (Join-Path $root "support.html") -Destination (Join-Path $www "support.html") -Force
Copy-Item -LiteralPath (Join-Path $root "manifest.webmanifest") -Destination (Join-Path $www "manifest.webmanifest") -Force
Copy-Item -LiteralPath (Join-Path $root "prescription-engine.js") -Destination (Join-Path $www "prescription-engine.js") -Force
Copy-Item -LiteralPath (Join-Path $root "rest-completion-controller.js") -Destination (Join-Path $www "rest-completion-controller.js") -Force
Copy-Item -LiteralPath (Join-Path $root "sw.js") -Destination (Join-Path $www "sw.js") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-180.png") -Destination (Join-Path $wwwResources "icon-180.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-192.png") -Destination (Join-Path $wwwResources "icon-192.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-512.png") -Destination (Join-Path $wwwResources "icon-512.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-maskable-512.png") -Destination (Join-Path $wwwResources "icon-maskable-512.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-1024.png") -Destination (Join-Path $wwwResources "icon-1024.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\splash-1170x2532.png") -Destination (Join-Path $wwwResources "splash-1170x2532.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\secondary-page.css") -Destination (Join-Path $wwwResources "secondary-page.css") -Force

foreach ($researchFile in @("exercise_database.json", "exercise_muscle_map.json", "exercise_substitution_map.json", "muscle_group_recommendations.json", "progression_rules.json", "nutrition_strategies.json", "manifest.json")) {
  Copy-Item -LiteralPath (Join-Path $root "research_database\exports\json\$researchFile") -Destination (Join-Path $wwwResearch $researchFile) -Force
}

$personalDerived = Join-Path $root "personal_fitness_data\derived"
$personalReports = Join-Path $root "personal_fitness_data\reports"
if (Test-Path -LiteralPath $personalDerived) {
  New-Item -ItemType Directory -Force -Path $wwwPrivatePersonal | Out-Null
  foreach ($personalFile in @("exercise_prescriptions.json", "exercise_scores.csv", "exercise_muscle_scores.csv", "exercise_session_metrics.csv", "weekly_muscle_volume_response.csv", "recovery_rules.json", "muscle_group_sweet_spots.json")) {
    $source = Join-Path $personalDerived $personalFile
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $wwwPrivatePersonal $personalFile) -Force }
  }
  $metadata = Join-Path $personalReports "analysis_metadata.json"
  if (Test-Path -LiteralPath $metadata) { Copy-Item -LiteralPath $metadata -Destination (Join-Path $wwwPrivatePersonal "analysis_metadata.json") -Force }
  Write-Host "Included private aggregate personal evidence in the local Capacitor payload (excluded from Git and Vercel)."
}

Write-Host "Synced web app and PWA files into www."
