$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$publicFiles = @(
  "index.html",
  "app-foundation.js",
  "app-coach.js",
  "app-views.js",
  "app-analysis.js",
  "app-workout.js",
  "app-sync.js",
  "app-history.js",
  "app-import.js",
  "app.js",
  "privacy.html",
  "support.html",
  "manifest.webmanifest",
  "prescription-engine.js",
  "exception-resolver.js",
  "rest-completion-controller.js",
  "coach-engine.js",
  "loaded-bar.js",
  "backup-contract.js",
  "sw.js",
  "resources\secondary-page.css",
  "resources\icon-180.png",
  "resources\icon-192.png",
  "resources\icon-512.png",
  "resources\icon-maskable-512.png",
  "resources\icon-1024.png",
  "resources\splash-1170x2532.png",
  "resources\exercise_database.json",
  "resources\exercise_muscle_map.json"
)
$compatibilityAssets = @(
  @{ Source = "research_database\exports\json\exercise_database.json"; Public = "resources\exercise_database.json" },
  @{ Source = "research_database\exports\json\exercise_muscle_map.json"; Public = "resources\exercise_muscle_map.json" }
)
$obsoleteAnalyticalJson = @(
  "research_database\exports\json\exercise_substitution_map.json",
  "research_database\exports\json\muscle_group_recommendations.json",
  "research_database\exports\json\progression_rules.json",
  "research_database\exports\json\nutrition_strategies.json",
  "research_database\exports\json\manifest.json"
)
$obsoletePublicFiles = @(
  "guided-mesocycle.js",
  "programming-family-ledger.js",
  "research_database\exports\json\exercise_database.json",
  "research_database\exports\json\exercise_muscle_map.json",
  "resources\achievements\badge-controlled-execution.png",
  "resources\achievements\badge-e1rm-peak.png",
  "resources\achievements\badge-personal-record.png",
  "resources\achievements\badge-plan-complete.png",
  "resources\achievements\badge-progression.png",
  "resources\achievements\badge-smart-training.png",
  "resources\achievements\badge-target-precision.png",
  "resources\achievements\badge-volume-record.png"
)

foreach ($asset in $compatibilityAssets) {
  $source = Join-Path $root $asset.Source
  $public = Join-Path $root $asset.Public
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing compatibility source asset: $($asset.Source)" }
  if (-not (Test-Path -LiteralPath $public -PathType Leaf)) { throw "Missing public compatibility asset: $($asset.Public)" }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $public).Hash) {
    throw "Public compatibility asset differs from its canonical source: $($asset.Public)"
  }
}

foreach ($relative in $publicFiles) {
  $source = Join-Path $root $relative
  $packaged = Join-Path (Join-Path $root "www") $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing public source file: $relative" }
  if (-not (Test-Path -LiteralPath $packaged -PathType Leaf)) { throw "Missing packaged public file: www\$relative" }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $packaged).Hash) {
    throw "Packaged public file differs from its source: $relative"
  }
}
foreach ($relative in $obsoleteAnalyticalJson) {
  $packaged = Join-Path (Join-Path $root "www") $relative
  if (Test-Path -LiteralPath $packaged) { throw "Obsolete analytical runtime asset remains packaged: www\$relative" }
}

$index = Get-Content -LiteralPath (Join-Path $root "index.html") -Raw
$app = Get-Content -LiteralPath (Join-Path $root "app.js") -Raw
foreach ($needle in @("manifest.webmanifest", "apple-mobile-web-app-capable", "apple-touch-icon", "apple-touch-startup-image", "prescription-engine.js", "exception-resolver.js", "rest-completion-controller.js", "coach-engine.js", "loaded-bar.js", "backup-contract.js", "app-foundation.js", "app-coach.js", "app-views.js", "app-analysis.js", "app-workout.js", "app-sync.js", "app-history.js", "app-import.js", "app.js")) {
  if ($index -notlike "*$needle*") { throw "index.html is missing required PWA marker: $needle" }
}
if ($app -notlike "*serviceWorker*") { throw "app.js is missing the service-worker registration boundary." }

$manifest = Get-Content -LiteralPath (Join-Path $root "manifest.webmanifest") -Raw | ConvertFrom-Json
if ($manifest.name -ne "Comprehensive Fitness") { throw "Manifest name is not Comprehensive Fitness." }
if ($manifest.display -ne "standalone") { throw "Manifest display must be standalone." }
if (-not ($manifest.icons | Where-Object { $_.purpose -eq "maskable" })) { throw "Manifest must include a maskable icon." }

$publicRoots = @(
  (Join-Path $root "www"),
  (Join-Path $root "android\app\src\main\assets\public"),
  (Join-Path $root "ios\App\App\public")
)
$sensitiveDirectoryNames = @("private-personal-data", "private_personal_data", "personal_fitness_data", "personal-fitness-data", "raw", "normalized", "derived", "reports", "backups")
$sensitiveExtensions = @(".env", ".db", ".sqlite", ".sqlite3", ".bak", ".backup")
foreach ($publicRoot in $publicRoots) {
  if (-not (Test-Path -LiteralPath $publicRoot -PathType Container)) { continue }
  foreach ($relative in $obsoletePublicFiles) {
    $obsolete = Join-Path $publicRoot $relative
    if (Test-Path -LiteralPath $obsolete) { throw "Deleted product asset remains packaged: $obsolete" }
  }
  $sensitiveFiles = Get-ChildItem -LiteralPath $publicRoot -Recurse -File | Where-Object {
    $relative = $_.FullName.Substring($publicRoot.Length).TrimStart('\', '/')
    $normalizedRelative = $relative -replace '\\', '/'
    $segments = $normalizedRelative -split '/'
    (($segments | Where-Object { $sensitiveDirectoryNames -contains $_ }).Count -gt 0) -or
      ($sensitiveExtensions -contains $_.Extension.ToLowerInvariant()) -or
      ($segments -contains "exports")
  }
  if ($sensitiveFiles) { throw "Sensitive files found in public/native payload $publicRoot`: $($sensitiveFiles.FullName -join ', ')" }
}

$vercelIgnore = Get-Content -LiteralPath (Join-Path $root ".vercelignore") -Raw
foreach ($needle in @("personal_fitness_data", "private-personal-data")) {
  if ($vercelIgnore -notlike "*$needle*") { throw ".vercelignore is missing private payload exclusion: $needle" }
}

$androidManifest = Get-Content -LiteralPath (Join-Path $root "android\app\src\main\AndroidManifest.xml") -Raw
foreach ($needle in @('android:allowBackup="false"', 'android:fullBackupContent="false"', 'android:dataExtractionRules="@xml/data_extraction_rules"', 'android:usesCleartextTraffic="false"')) {
  if ($androidManifest -notlike "*$needle*") { throw "Android manifest is missing privacy control: $needle" }
}

$filePaths = Get-Content -LiteralPath (Join-Path $root "android\app\src\main\res\xml\file_paths.xml") -Raw
if ($filePaths -like '*<external-path*' -or $filePaths -like '*path="."*') { throw "Android FileProvider exposes an overly broad path." }

$dataRules = Get-Content -LiteralPath (Join-Path $root "android\app\src\main\res\xml\data_extraction_rules.xml") -Raw
foreach ($domain in @("root", "file", "database", "sharedpref", "external")) {
  if ($dataRules -notlike "*exclude domain=`"$domain`" path=`".`"*") { throw "Android data extraction rules do not exclude $domain." }
}

$serviceWorker = Get-Content -LiteralPath (Join-Path $root "sw.js") -Raw
foreach ($needle in @("PUBLIC_CACHE_PATHS", "isSensitivePath", 'cache: "no-store"', "isPublicCacheUrl", "responseCanBeCached", "safeNotificationUrl", "pushPayloadWasCanceled")) {
  if ($serviceWorker -notlike "*$needle*") { throw "Service worker is missing public-cache privacy control: $needle" }
}
if ($serviceWorker -like '*if (response.ok) caches.open*') { throw "Service worker still contains generic successful-response caching." }

Write-Host "PWA/native public-only packaging verification passed for $($publicFiles.Count) assets."
