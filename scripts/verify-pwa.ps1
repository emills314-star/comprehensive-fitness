$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$required = @(
  "index.html",
  "privacy.html",
  "support.html",
  "manifest.webmanifest",
  "sw.js",
  "resources\icon-180.png",
  "resources\icon-192.png",
  "resources\icon-512.png",
  "www\index.html",
  "www\manifest.webmanifest",
  "www\sw.js",
  "www\resources\icon-180.png",
  "www\resources\icon-192.png",
  "www\resources\icon-512.png"
)

$missing = $required | Where-Object { -not (Test-Path -LiteralPath (Join-Path $root $_) -PathType Leaf) }
if ($missing.Count -gt 0) {
  throw "Missing PWA files: $($missing -join ', ')"
}

$index = Get-Content -LiteralPath (Join-Path $root "index.html") -Raw
foreach ($needle in @("manifest.webmanifest", "apple-mobile-web-app-capable", "apple-touch-icon", "serviceWorker")) {
  if ($index -notlike "*$needle*") {
    throw "index.html is missing required PWA marker: $needle"
  }
}

$manifest = Get-Content -LiteralPath (Join-Path $root "manifest.webmanifest") -Raw | ConvertFrom-Json
if ($manifest.name -ne "Comprehensive Fitness") {
  throw "Manifest name is not Comprehensive Fitness."
}
if ($manifest.display -ne "standalone") {
  throw "Manifest display must be standalone."
}

Write-Host "PWA verification passed."
