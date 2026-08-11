param(
  [string]$OutputRoot = "artifacts/kimi-design"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  $env:KIMI_SCREENSHOT_DIR = $OutputRoot
  & npm.cmd exec playwright test -- tests/ui/redesign-m5-navigation-and-drafts.spec.js tests/ui/redesign-m6-active-workout.spec.js tests/ui/redesign-m7-grade-progress.spec.js tests/ui/redesign-m4-factual-progress.spec.js
  if ($LASTEXITCODE -ne 0) { throw "Playwright screenshot refresh failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}
