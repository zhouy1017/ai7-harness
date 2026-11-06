<#
.SYNOPSIS
Refresh the Owner's fixed local human-test build of AI7 from a Git ref (default `dev`).

.DESCRIPTION
Builds the named ref with the ordinary `pnpm run package` in a dedicated source worktree and
places the result in one fixed folder that human testing always uses:

  <OutputRoot>\AI7\app\AI7.exe        the portable application (replaced on every refresh)
  <OutputRoot>\AI7\data               the tester's product data (preserved across refreshes)
  <OutputRoot>\AI7-<version>-win-x64-setup.exe
  <OutputRoot>\self-check.txt         the packaged portable self-check of this build
  <OutputRoot>\BUILD-INFO.txt / .json ref, commit, version, protocol, build time
  <OutputRoot>\previous\app           the previous application, kept for one generation
  <OutputRoot>\启动 AI7.cmd            double-click launcher

The script is idempotent: when BUILD-INFO.json already names the ref's current commit it exits
without building unless -Force is given. It never touches the repository checkout it was started
from, writes nothing outside the source worktree and the output folder, and reads no credentials.
Run it after every wave merge into `dev` (docs/agents/orca-dispatch.md §5).

.PARAMETER Ref
Branch name (default `dev`) or full commit SHA to build.
.PARAMETER OutputRoot
The fixed human-test folder. Default: $env:AI7_HUMAN_TEST_ROOT, else `<repo parent>\AI7-human-test`.
.PARAMETER SourceWorktree
The dedicated build worktree. Default `<repo parent>\ai7-human-test-src`; created on first use.
.PARAMETER Remote
HTTPS remote used for fetching (SSH to GitHub is not assumed to work on the host).
.PARAMETER Force
Rebuild even when the output folder already carries the ref's current commit.
#>
[CmdletBinding()]
param(
  [string]$Ref = 'dev',
  [string]$OutputRoot = '',
  [string]$SourceWorktree = '',
  [string]$Remote = 'https://github.com/zhouy1017/ai7-harness.git',
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$parent = Split-Path -Parent $repo
if (-not $OutputRoot) { $OutputRoot = if ($env:AI7_HUMAN_TEST_ROOT) { $env:AI7_HUMAN_TEST_ROOT } else { Join-Path $parent 'AI7-human-test' } }
if (-not $SourceWorktree) { $SourceWorktree = Join-Path $parent 'ai7-human-test-src' }

function Invoke-Checked([string]$Description, [scriptblock]$Command) {
  Write-Host "HUMAN_TEST_BUILD/$Description"
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "AI7_HUMAN_TEST_BUILD_FAILED/$Description (exit $LASTEXITCODE)" }
}

# 1. Resolve the commit the ref points at today.
$target = if ($Ref -match '^[0-9a-f]{40}$') { $Ref } else {
  $line = git ls-remote $Remote "refs/heads/$Ref" 2>$null | Select-Object -First 1
  if (-not $line) { throw "AI7_HUMAN_TEST_BUILD_REF_UNKNOWN/$Ref" }
  ($line -split '\s+')[0]
}
$infoPath = Join-Path $OutputRoot 'BUILD-INFO.json'
if (-not $Force -and (Test-Path $infoPath)) {
  $current = Get-Content $infoPath -Raw | ConvertFrom-Json
  if ($current.commit -eq $target) {
    Write-Host "HUMAN_TEST_BUILD/current ($Ref @ $($target.Substring(0,8)) already in $OutputRoot)"
    exit 0
  }
}

# 2. Refuse to replace an application that is running from the output folder.
$appDir = Join-Path $OutputRoot 'AI7\app'
$running = Get-Process -Name 'AI7' -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($OutputRoot, [System.StringComparison]::OrdinalIgnoreCase) }
if ($running) { throw "AI7_HUMAN_TEST_BUILD_APP_RUNNING/close AI7 started from $OutputRoot first" }

# 3. Source worktree at the exact commit.
if (-not (Test-Path (Join-Path $SourceWorktree '.git'))) {
  Invoke-Checked 'fetch' { git -C $repo fetch --quiet $Remote $target }
  Invoke-Checked 'worktree-add' { git -C $repo worktree add --detach $SourceWorktree $target }
} else {
  Invoke-Checked 'fetch' { git -C $SourceWorktree fetch --quiet $Remote $target }
  Invoke-Checked 'checkout' { git -C $SourceWorktree checkout --quiet --detach $target }
  Invoke-Checked 'reset' { git -C $SourceWorktree reset --quiet --hard $target }
}
$head = (git -C $SourceWorktree rev-parse HEAD).Trim()
if ($head -ne $target) { throw "AI7_HUMAN_TEST_BUILD_HEAD_MISMATCH/$head" }
if (git -C $SourceWorktree status --porcelain) { throw 'AI7_HUMAN_TEST_BUILD_WORKTREE_DIRTY' }

# 4. Seed the offline caches from the main checkout on first use (ignored paths, never committed).
$mainRepo = Split-Path -Parent ((git -C $repo rev-parse --path-format=absolute --git-common-dir).Trim())
foreach ($cache in @('.cache\bootstrap', '.pnpm-store')) {
  $to = Join-Path $SourceWorktree $cache
  $from = @($repo, $mainRepo) | ForEach-Object { Join-Path $_ $cache } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($from -and -not (Test-Path $to)) {
    Write-Host "HUMAN_TEST_BUILD/seed-cache $cache"
    # Junctions and locked store directories are skipped; bootstrap re-fetches anything a cache lacks.
    robocopy $from $to /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 16) { throw "AI7_HUMAN_TEST_BUILD_CACHE_SEED_FAILED/$cache" }
    if ($LASTEXITCODE -ge 8) { Write-Host "HUMAN_TEST_BUILD/seed-cache-partial $cache (robocopy $LASTEXITCODE)" }
  }
}

# 5. Build with the ordinary provider-free commands.
Remove-Item Env:NODE_USE_SYSTEM_CA -ErrorAction SilentlyContinue
Push-Location $SourceWorktree
try {
  Invoke-Checked 'doctor' { pnpm run doctor }
  Invoke-Checked 'bootstrap' { pnpm run bootstrap }
  Invoke-Checked 'package' { pnpm run package }
} finally { Pop-Location }

$release = Join-Path $SourceWorktree 'release'
$manifest = Get-Content (Join-Path $SourceWorktree 'package.json') -Raw | ConvertFrom-Json
$version = $manifest.version
$setup = Join-Path $release "AI7-$version-win-x64-setup.exe"
$selfCheck = Join-Path $release 'self-check.txt'
foreach ($required in @((Join-Path $release 'AI7\app\AI7.exe'), $setup, $selfCheck)) {
  if (-not (Test-Path $required)) { throw "AI7_HUMAN_TEST_BUILD_OUTPUT_MISSING/$required" }
}
$protocol = (Select-String -Path (Join-Path $SourceWorktree 'src\shared\protocol.ts') -Pattern 'SERVICE_PROTOCOL_VERSION = (\d+)').Matches[0].Groups[1].Value

# 6. Stage into the fixed folder: replace app, keep data, keep one previous generation.
New-Item -ItemType Directory -Force (Join-Path $OutputRoot 'AI7\data') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $OutputRoot 'AI7\resources') | Out-Null
$previous = Join-Path $OutputRoot 'previous\app'
if (Test-Path $appDir) {
  if (Test-Path $previous) { Remove-Item -Recurse -Force $previous }
  New-Item -ItemType Directory -Force (Split-Path -Parent $previous) | Out-Null
  Move-Item $appDir $previous
}
Write-Host 'HUMAN_TEST_BUILD/stage-app'
robocopy (Join-Path $release 'AI7\app') $appDir /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw 'AI7_HUMAN_TEST_BUILD_STAGE_FAILED/app' }
Copy-Item (Join-Path $release 'AI7\resources\channel.json') (Join-Path $OutputRoot 'AI7\resources\channel.json') -Force
Get-ChildItem $OutputRoot -Filter 'AI7-*-win-x64-setup.exe' | Remove-Item -Force
Copy-Item $setup $OutputRoot -Force
Copy-Item $selfCheck (Join-Path $OutputRoot 'self-check.txt') -Force

$built = Get-Date
$info = [ordered]@{ ref = $Ref; commit = $target; version = $version; protocol = [int]$protocol
  built = $built.ToString('yyyy-MM-dd HH:mm:ss zzz'); sourceWorktree = $SourceWorktree; selfCheck = 'pass' }
$info | ConvertTo-Json | Set-Content $infoPath -Encoding UTF8
@(
  "AI7 human-test build"
  "source: $Ref @ $target"
  "version: $version (service protocol $protocol)"
  "built: $($info.built) with pnpm run package in $SourceWorktree (portable self-check: pass)"
  "run: AI7\app\AI7.exe (or 启动 AI7.cmd); product data stays in AI7\data across refreshes"
  "installer: AI7-$version-win-x64-setup.exe (unsigned, per-user)"
  "previous application: previous\app"
) | Set-Content (Join-Path $OutputRoot 'BUILD-INFO.txt') -Encoding UTF8
"@echo off`r`nstart `"`" `"%~dp0AI7\app\AI7.exe`"`r`n" | Set-Content (Join-Path $OutputRoot '启动 AI7.cmd') -Encoding OEM

Write-Host "HUMAN_TEST_BUILD/complete $version @ $($target.Substring(0,8)) -> $OutputRoot"
# The last native command (robocopy) leaves a non-zero success code; the script's own result is clean.
exit 0
