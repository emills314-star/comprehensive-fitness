param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if ((git -C $repoRoot branch --show-current) -ne "codex/kimi-k3-redesign") {
  throw "Open the isolated codex/kimi-k3-redesign worktree before starting Kimi."
}

$kilo = Get-Command kilo.cmd -ErrorAction SilentlyContinue
if (-not $kilo) { throw "kilo.cmd is not available." }
if (-not $env:MODAL_KIMI_KILO_MODEL) {
  throw "MODAL_KIMI_KILO_MODEL is unset. Set it only after the authenticated Modal model ID and Kilo provider alias are verified."
}

Write-Host "Kilo: $(& $kilo.Source --version)"
Write-Host "Model: $env:MODAL_KIMI_KILO_MODEL"
Write-Host "Prompt: .kilo/prompts/kimi-01-global-design.md"
if ($CheckOnly) { exit 0 }

& $kilo.Source $repoRoot --model $env:MODAL_KIMI_KILO_MODEL
