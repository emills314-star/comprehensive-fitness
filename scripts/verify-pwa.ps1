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
  "backup-contract.js",
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

foreach ($relative in $publicFiles) {
  $source = Join-Path $root $relative
  $packaged = Join-Path (Join-Path $root "www") $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing public source file: $relative" }
  if (-not (Test-Path -LiteralPath $packaged -PathType Leaf)) { throw "Missing packaged public file: www\$relative" }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $packaged).Hash) {
    throw "Packaged public file differs from its source: $relative"
  }
}

$index = Get-Content -LiteralPath (Join-Path $root "index.html") -Raw
foreach ($needle in @("manifest.webmanifest", "apple-mobile-web-app-capable", "apple-touch-icon", "apple-touch-startup-image", "prescription-engine.js", "guided-mesocycle.js", "rest-completion-controller.js", "backup-contract.js", "serviceWorker")) {
  if ($index -notlike "*$needle*") { throw "index.html is missing required PWA marker: $needle" }
}

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
  $sensitiveFiles = Get-ChildItem -LiteralPath $publicRoot -Recurse -File | Where-Object {
    $relative = $_.FullName.Substring($publicRoot.Length).TrimStart('\', '/')
    $segments = $relative -split '[\\/]'
    (($segments | Where-Object { $sensitiveDirectoryNames -contains $_ }).Count -gt 0) -or
      ($sensitiveExtensions -contains $_.Extension.ToLowerInvariant()) -or
      (($segments -contains "exports") -and -not ($relative -like "research_database\exports\json\*"))
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
