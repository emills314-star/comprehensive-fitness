param(
  [Parameter(Mandatory = $true)][string]$Specification,
  [Parameter(Mandatory = $true)][string]$BeforeDirectory,
  [Parameter(Mandatory = $true)][string]$AfterDirectory,
  [string]$Output = "artifacts/kimi-design/review-manifest.txt"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$paths = @($Specification, $BeforeDirectory, $AfterDirectory) | ForEach-Object {
  $resolved = Resolve-Path -LiteralPath (Join-Path $repoRoot $_)
  $resolved.Path
}
$outputPath = Join-Path $repoRoot $Output
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
@(
  "Specification: $($paths[0])"
  "Before screenshots: $($paths[1])"
  "After screenshots: $($paths[2])"
  "Prompt: .kilo/prompts/kimi-review-template.md"
) | Set-Content -LiteralPath $outputPath -Encoding utf8
Write-Host $outputPath
