param(
  [Parameter(Mandatory = $true)][string]$PromptFile,
  [Parameter(Mandatory = $true)][string]$OutputFile,
  [string[]]$Attachments = @(),
  [Parameter(Mandatory = $true)][string]$SessionTitle,
  [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$kilo = Get-Command kilo.cmd -ErrorAction SilentlyContinue
if (-not $kilo) { throw "kilo.cmd is not available." }

$promptPath = (Resolve-Path -LiteralPath (Join-Path $repoRoot $PromptFile)).Path
$outputPath = Join-Path $repoRoot $OutputFile
$rawDir = Join-Path $repoRoot "artifacts/kimi-workspace/raw"
$isolatedRoot = Join-Path $repoRoot "artifacts/kimi-workspace"
$inputDir = Join-Path $isolatedRoot "inputs"
$rawPath = Join-Path $rawDir (([IO.Path]::GetFileNameWithoutExtension($OutputFile)) + ".jsonl")
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath), $rawDir, $inputDir | Out-Null

$modelList = & $kilo.Source models modal-kimi 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $modelList -notmatch "kimi-k3") { throw "Configured Modal K3 model is unavailable." }

$localPrompt = Join-Path $inputDir "task-prompt.md"
Copy-Item -LiteralPath $promptPath -Destination $localPrompt -Force
$localAttachments = @($localPrompt)
$attachmentIndex = 0
foreach ($attachment in $Attachments) {
  $source = (Resolve-Path -LiteralPath (Join-Path $repoRoot $attachment)).Path
  $attachmentIndex += 1
  $target = Join-Path $inputDir ("{0:D2}-{1}" -f $attachmentIndex, [IO.Path]::GetFileName($source))
  Copy-Item -LiteralPath $source -Destination $target -Force
  $localAttachments += $target
}
$arguments = @("run", "Follow task-prompt.md exactly. Use only the attached inputs. Return the requested final Markdown and do not call tools beyond reading these files.", "--auto", "--model", "modal-kimi/kimi-k3", "--agent", "design-review", "--format", "json", "--title", $SessionTitle)
foreach ($attachment in $localAttachments) { $arguments += @("--file", $attachment) }

$processInfo = [Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $kilo.Source
$processInfo.WorkingDirectory = $isolatedRoot
$processInfo.UseShellExecute = $false
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
function ConvertTo-ProcessArgument([string]$value) {
  if ($value -notmatch '[\s"]') { return $value }
  return '"' + (($value -replace '(\\*)"', '$1$1\"') -replace '(\\+)$', '$1$1') + '"'
}
$escapedArguments = @($arguments | ForEach-Object { ConvertTo-ProcessArgument $_ })
$processInfo.Arguments = [string]::Join(" ", $escapedArguments)
$process = [Diagnostics.Process]::Start($processInfo)
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()
if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
  $process.Kill()
  exit 124
}
$stdout = $stdoutTask.Result
$stderr = $stderrTask.Result
[IO.File]::WriteAllText($rawPath, $stdout, [Text.UTF8Encoding]::new($false))
if ($process.ExitCode -ne 0) { throw "Kilo design call failed with exit code $($process.ExitCode): $stderr" }

$assistantText = @()
foreach ($line in ($stdout -split "`r?`n")) {
  if (-not $line.Trim()) { continue }
  try {
    $event = $line | ConvertFrom-Json
    if ($event.type -match "text|message|response" -and $event.part.text) { $assistantText += [string]$event.part.text }
    elseif ($event.message.role -eq "assistant" -and $event.message.content) { $assistantText += [string]$event.message.content }
  } catch { }
}
if (-not $assistantText.Count) {
  $assistantText = @($stdout)
}
[IO.File]::WriteAllText($outputPath, ($assistantText -join "`n"), [Text.UTF8Encoding]::new($false))
Write-Output $outputPath
