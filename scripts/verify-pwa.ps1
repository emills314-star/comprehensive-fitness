$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$publicFiles = @(
  "index.html",
  "privacy.html",
  "support.html",
  "manifest.webmanifest",
  "prescription-engine.js",
  "guided-mesocycle.js",
  "rest-completion-controller.js",
  "sw.js",
  "resources\secondary-page.css",
  "resources\icon-180.png",
  "resources\icon-192.png",
  "resources\icon-512.png",
  "resources\icon-maskable-512.png",
  "resources\icon-1024.png",
  "resources\splash-1170x2532.png",
  "research_database\exports\json\exercise_database.json",
  "research_database\exports\json\exercise_muscle_map.json",
  "research_database\exports\json\exercise_substitution_map.json",
  "research_database\exports\json\muscle_group_recommendations.json",
  "research_database\exports\json\progression_rules.json",
  "research_database\exports\json\nutrition_strategies.json",
  "research_database\exports\json\manifest.json"
)

$missing = @()
$mismatched = @()
foreach ($relative in $publicFiles) {
  $source = Join-Path $root $relative
  $packaged = Join-Path $root (Join-Path "www" $relative)
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { $missing += $relative; continue }
  if (-not (Test-Path -LiteralPath $packaged -PathType Leaf)) { $missing += "www\$relative"; continue }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $packaged).Hash) {
    $mismatched += $relative
  }
}
if ($missing.Count -gt 0) { throw "Missing PWA files: $($missing -join ', ')" }
if ($mismatched.Count -gt 0) { throw "Root/www parity failed: $($mismatched -join ', ')" }

$index = Get-Content -LiteralPath (Join-Path $root "index.html") -Raw
foreach ($needle in @("manifest.webmanifest", "apple-mobile-web-app-capable", "apple-touch-icon", "apple-touch-startup-image", "prescription-engine.js", "guided-mesocycle.js", "rest-completion-controller.js", "serviceWorker")) {
  if ($index -notlike "*$needle*") { throw "index.html is missing required PWA marker: $needle" }
}

$manifest = Get-Content -LiteralPath (Join-Path $root "manifest.webmanifest") -Raw | ConvertFrom-Json
if ($manifest.name -ne "Comprehensive Fitness") { throw "Manifest name is not Comprehensive Fitness." }
if ($manifest.display -ne "standalone") { throw "Manifest display must be standalone." }
if (-not ($manifest.icons | Where-Object { $_.purpose -eq "maskable" })) { throw "Manifest must include a maskable icon." }

$serviceWorker = Get-Content -LiteralPath (Join-Path $root "sw.js") -Raw
foreach ($needle in @("PUBLIC_CACHE_PATHS", "isSensitivePath", 'cache: "no-store"', "/private-personal-data/", "/api/")) {
  if ($serviceWorker -notlike "*$needle*") { throw "Service worker is missing privacy guard: $needle" }
}

$sensitivePattern = '(?i)(^|[\\/])(private-personal-data|personal_fitness_data|personal-fitness-data|raw|normalized|derived|reports|backups|exports)([\\/]|$)|\.(env|db|sqlite|sqlite3|bak|backup)$'
$packageRoots = @(
  (Join-Path $root "www"),
  (Join-Path $root "android\app\src\main\assets\public"),
  (Join-Path $root "ios\App\App\public")
)
$sensitiveFiles = @()
foreach ($packageRoot in $packageRoots) {
  if (-not (Test-Path -LiteralPath $packageRoot)) { continue }
  $sensitiveFiles += Get-ChildItem -LiteralPath $packageRoot -File -Recurse | Where-Object {
    $relative = $_.FullName.Substring($packageRoot.Length).TrimStart([char[]]"\/")
    $relative -match $sensitivePattern -and $relative -notmatch '(?i)^research_database[\\/]exports[\\/]json[\\/]'
  } | Select-Object -ExpandProperty FullName
}
if ($sensitiveFiles.Count -gt 0) { throw "Sensitive files found in public/native payload: $($sensitiveFiles -join ', ')" }

$vercelIgnore = Get-Content -LiteralPath (Join-Path $root ".vercelignore") -Raw
foreach ($needle in @("personal_fitness_data/**", "www/private-personal-data/**", "private-personal-data/**")) {
  if ($vercelIgnore -notlike "*$needle*") { throw ".vercelignore is missing required privacy exclusion: $needle" }
}

$androidManifest = Get-Content -LiteralPath (Join-Path $root "android\app\src\main\AndroidManifest.xml") -Raw
if ($androidManifest -notmatch 'android:allowBackup="false"') { throw "Android backup must be disabled." }
if ($androidManifest -notmatch 'android:usesCleartextTraffic="false"') { throw "Android cleartext traffic must be disabled." }
$filePaths = Get-Content -LiteralPath (Join-Path $root "android\app\src\main\res\xml\file_paths.xml") -Raw
if ($filePaths -match '<external-path|path="\."') { throw "Android FileProvider exposes an unsafe broad path." }

Write-Host "PWA verification passed for $($publicFiles.Count) parity-checked public assets with native/privacy guards."
