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
$compatibilityAssets = @(
  @{ Source = "research_database\exports\json\exercise_database.json"; Destination = "resources\exercise_database.json" },
  @{ Source = "research_database\exports\json\exercise_muscle_map.json"; Destination = "resources\exercise_muscle_map.json" }
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
  foreach ($relative in $obsoleteAnalyticalJson) {
    $candidate = Join-Path $publicRoot $relative
    $resolvedCandidate = [IO.Path]::GetFullPath($candidate)
    if (-not $resolvedCandidate.StartsWith($resolvedPublicRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to prune a path outside the intended public payload root: $resolvedCandidate"
    }
    if (Test-Path -LiteralPath $resolvedCandidate -PathType Leaf) { Remove-Item -LiteralPath $resolvedCandidate -Force }
  }
  foreach ($relative in $obsoletePublicFiles) {
    $candidate = Join-Path $publicRoot $relative
    $resolvedCandidate = [IO.Path]::GetFullPath($candidate)
    if (-not $resolvedCandidate.StartsWith($resolvedPublicRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to prune a path outside the intended public payload root: $resolvedCandidate"
    }
    if (Test-Path -LiteralPath $resolvedCandidate -PathType Leaf) { Remove-Item -LiteralPath $resolvedCandidate -Force }
  }
}

# Materialize the two explicitly public compatibility assets outside the
# repository's export tree. Vercel excludes exports from source deployments,
# while resources/ is the stable public runtime boundary for every package.
foreach ($asset in $compatibilityAssets) {
  $source = Join-Path $root $asset.Source
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing compatibility source asset: $($asset.Source)" }
  $destination = Join-Path $root $asset.Destination
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
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
  @{ Source = "exception-resolver.js"; Destination = "exception-resolver.js" },
  @{ Source = "prescription-engine.js"; Destination = "prescription-engine.js" },
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
  @{ Source = "resources\exercise_database.json"; Destination = "resources\exercise_database.json" },
  @{ Source = "resources\exercise_muscle_map.json"; Destination = "resources\exercise_muscle_map.json" }
)

foreach ($file in $publicFiles) {
  $source = Join-Path $root $file.Source
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing public source asset: $($file.Source)" }
  $destination = Join-Path $www $file.Destination
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
  Copy-Item -LiteralPath $source -Destination $destination -Force
}

Write-Host "Synced $($publicFiles.Count) public-only web/PWA assets and pruned stale private native payloads."
