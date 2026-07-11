$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$www = Join-Path $root "www"
$wwwResources = Join-Path $www "resources"

New-Item -ItemType Directory -Force -Path $www | Out-Null
New-Item -ItemType Directory -Force -Path $wwwResources | Out-Null

Copy-Item -LiteralPath (Join-Path $root "index.html") -Destination (Join-Path $www "index.html") -Force
Copy-Item -LiteralPath (Join-Path $root "privacy.html") -Destination (Join-Path $www "privacy.html") -Force
Copy-Item -LiteralPath (Join-Path $root "support.html") -Destination (Join-Path $www "support.html") -Force
Copy-Item -LiteralPath (Join-Path $root "manifest.webmanifest") -Destination (Join-Path $www "manifest.webmanifest") -Force
Copy-Item -LiteralPath (Join-Path $root "sw.js") -Destination (Join-Path $www "sw.js") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-180.png") -Destination (Join-Path $wwwResources "icon-180.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-192.png") -Destination (Join-Path $wwwResources "icon-192.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-512.png") -Destination (Join-Path $wwwResources "icon-512.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-maskable-512.png") -Destination (Join-Path $wwwResources "icon-maskable-512.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\icon-1024.png") -Destination (Join-Path $wwwResources "icon-1024.png") -Force
Copy-Item -LiteralPath (Join-Path $root "resources\splash-1170x2532.png") -Destination (Join-Path $wwwResources "splash-1170x2532.png") -Force

Write-Host "Synced web app and PWA files into www."
