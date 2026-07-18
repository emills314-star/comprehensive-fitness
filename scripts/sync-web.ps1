$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$www = Join-Path $root "www"
$nativePublicRoots = @(
  $www,
  (Join-Path $root "android\app\src\main\assets\public"),
  (Join-Path $root "ios\App\App\public")
)
$sensitiveRelativeRoots = @(
  "private-personal-data",
  "personal_fitness_data",
  "personal-fitness-data",
  "backups",
  "exports"
)

New-Item -ItemType Directory -Force -Path $www | Out-Null

# Packaging is public-only. Prune stale private copies first so a previous local
# build cannot leak data into a later PWA, Android, or iOS release payload.
foreach ($publicRoot in $nativePublicRoots) {
  $resolvedPublicRoot = [IO.Path]::GetFullPath($publicRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  foreach ($relative in $sensitiveRelativeRoots) {
    $candidate = Join-Path $publicRoot $relative
    $resolvedCandidate = [IO.Path]::GetFullPath($candidate)
    if (-not $resolvedCandidate.StartsWith($resolvedPublicRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to prune a path outside the intended public payload root: $resolvedCandidate"
    }
    if (Test-Path -LiteralPath $resolvedCandidate) { Remove-Item -LiteralPath $resolvedCandidate -Recurse -Force }
  }
}

$publicFiles = @(
  @{ Source = "index.html"; Destination = "index.html" },
  @{ Source = "app-foundation.js"; Destination = "app-foundation.js" },
  @{ Source = "app-views.js"; Destination = "app-views.js" },
  @{ Source = "app-analysis.js"; Destination = "app-analysis.js" },
  @{ Source = "app-workout.js"; Destination = "app-workout.js" },
  @{ Source = "app-sync.js"; Destination = "app-sync.js" },
  @{ Source = "app-history.js"; Destination = "app-history.js" },
  @{ Source = "app-import.js"; Destination = "app-import.js" },
  @{ Source = "app.js"; Destination = "app.js" },
  @{ Source = "privacy.html"; Destination = "privacy.html" },
  @{ Source = "support.html"; Destination = "support.html" },
  @{ Source = "manifest.webmanifest"; Destination = "manifest.webmanifest" },
  @{ Source = "prescription-engine.js"; Destination = "prescription-engine.js" },
  @{ Source = "guided-mesocycle.js"; Destination = "guided-mesocycle.js" },
  @{ Source = "rest-completion-controller.js"; Destination = "rest-completion-controller.js" },
  @{ Source = "backup-contract.js"; Destination = "backup-contract.js" },
  @{ Source = "sw.js"; Destination = "sw.js" },
  @{ Source = "resources\secondary-page.css"; Destination = "resources\secondary-page.css" },
  @{ Source = "resources\icon-180.png"; Destination = "resources\icon-180.png" },
  @{ Source = "resources\icon-192.png"; Destination = "resources\icon-192.png" },
  @{ Source = "resources\icon-512.png"; Destination = "resources\icon-512.png" },
  @{ Source = "resources\icon-maskable-512.png"; Destination = "resources\icon-maskable-512.png" },
  @{ Source = "resources\icon-1024.png"; Destination = "resources\icon-1024.png" },
  @{ Source = "resources\splash-1170x2532.png"; Destination = "resources\splash-1170x2532.png" },
  @{ Source = "research_database\exports\json\exercise_database.json"; Destination = "research_database\exports\json\exercise_database.json" },
  @{ Source = "research_database\exports\json\exercise_muscle_map.json"; Destination = "research_database\exports\json\exercise_muscle_map.json" },
  @{ Source = "research_database\exports\json\exercise_substitution_map.json"; Destination = "research_database\exports\json\exercise_substitution_map.json" },
  @{ Source = "research_database\exports\json\muscle_group_recommendations.json"; Destination = "research_database\exports\json\muscle_group_recommendations.json" },
  @{ Source = "research_database\exports\json\progression_rules.json"; Destination = "research_database\exports\json\progression_rules.json" },
  @{ Source = "research_database\exports\json\nutrition_strategies.json"; Destination = "research_database\exports\json\nutrition_strategies.json" },
  @{ Source = "research_database\exports\json\manifest.json"; Destination = "research_database\exports\json\manifest.json" }
)

foreach ($file in $publicFiles) {
  $source = Join-Path $root $file.Source
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing public source asset: $($file.Source)" }
  $destination = Join-Path $www $file.Destination
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

Write-Host "Synced $($publicFiles.Count) public-only web/PWA assets and pruned stale private native payloads."
