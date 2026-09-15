# Veloce installer for Windows.
#
# Checks that git, Node.js and Yarn are usable (offering to install what is
# missing), clones the repository into a directory you choose, installs the
# dependencies and starts the server. Everything it may do outside the target
# directory is asked for first.
#
# Run it directly, or straight from the repository:
#   irm https://raw.githubusercontent.com/veloce-ailab/veloce-lab/main/scripts/install.ps1 | iex
#
# Nothing here calls `exit`, so running it through `iex` does not close the
# window you started it from.

# Note for the `irm ... | iex` form: iex runs this in the caller's own session,
# and a validation attribute is checked against the parameter's default value as
# well - which fails for an unbound [string] with "cannot add property, because
# the variable Mode with value  will no longer be valid". So the values are
# validated in the body instead of by attribute, and `exit` is never called.
[CmdletBinding()]
param(
  [string]$Dir,
  [string]$Branch = "main",
  [string]$Repo = "https://github.com/veloce-ailab/veloce-lab",
  [int]$Port = 0,
  [string]$Mode,
  [switch]$NoStart,
  [switch]$Yes,
  [switch]$DryRun,
  [switch]$Help
)

# $ErrorActionPreference is deliberately left alone: under `iex` setting it would
# change the caller's session. Failures are handled explicitly instead, with
# Get-Command checks and an exit-code check after every native command.
$script:MinNodeMajor = 22
$script:MinNodeMinor = 5
$script:RecommendedNode = 24
$script:DryRun = [bool]$DryRun
$script:AssumeYes = [bool]$Yes

function Write-Step($message) { Write-Host ""; Write-Host "== $message" -ForegroundColor Cyan }
function Write-Note($message) { Write-Host "  $message" }
function Write-Warn2($message) { Write-Host "! $message" -ForegroundColor Yellow }
function Write-Fail($message) { Write-Host "x $message" -ForegroundColor Red }

function Show-Usage {
  @"
Veloce installer

Usage: install.ps1 [options]

  -Dir <path>       directory to install into (default: the current one when it
                    is empty, otherwise .\veloce-lab)
  -Branch <name>    git branch or tag to clone (default: main)
  -Repo <url>       repository to clone (default: the official one)
  -Port <number>    port the server listens on (default: whatever the cloned
                    yumeri.json says, normally 3000)
  -Mode dev|prod    dev starts without a build (default); prod builds first
  -NoStart          install only, do not start the server
  -Yes              accept every default, install nothing without asking
  -DryRun           print what would happen and change nothing
  -Help             this text
"@ | Write-Host
}

# ------------------------------------------------------------------ prompting --
# A prompt needs a console; when there is none (a scheduled task, a pipe), the
# default is used instead of hanging.
function Read-Answer($question, $default) {
  if ($script:AssumeYes) { return $default }
  try {
    $answer = Read-Host "$question [$default]"
  } catch {
    Write-Warn2 "no console to ask on; using the default"
    return $default
  }
  if ([string]::IsNullOrWhiteSpace($answer)) { return $default }
  return $answer.Trim()
}

function Confirm-Answer($question, [bool]$defaultYes = $true) {
  if ($script:AssumeYes) { return $defaultYes }
  $hint = if ($defaultYes) { "Y/n" } else { "y/N" }
  try {
    $answer = Read-Host "$question [$hint]"
  } catch {
    Write-Warn2 "no console to ask on; using the default"
    return $defaultYes
  }
  if ([string]::IsNullOrWhiteSpace($answer)) { return $defaultYes }
  return $answer.Trim() -match '^(y|yes)$'
}

# Runs one command, honouring -DryRun and failing loudly on a non-zero exit.
function Invoke-CommandStep {
  param([string]$File, [string[]]$Arguments, [string]$WorkDir)
  $pretty = "$File $($Arguments -join ' ')"
  if ($script:DryRun) { Write-Note "(dry run) $pretty"; return }
  if ($WorkDir) { Push-Location $WorkDir }
  try {
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "'$pretty' failed with exit code $LASTEXITCODE" }
  } finally {
    if ($WorkDir) { Pop-Location }
  }
}

function Get-VersionOf($File) {
  $command = Get-Command $File -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  try {
    $raw = & $File --version 2>$null
  } catch {
    return $null
  }
  if (-not $raw) { return $null }
  return ([string]$raw).Trim().TrimStart("v")
}

function Test-VersionAtLeast($version, [int]$wantMajor, [int]$wantMinor) {
  if (-not $version) { return $false }
  $parts = $version.Split(".")
  $major = 0; $minor = 0
  [void][int]::TryParse($parts[0], [ref]$major)
  if ($parts.Count -gt 1) { [void][int]::TryParse($parts[1], [ref]$minor) }
  if ($major -gt $wantMajor) { return $true }
  if ($major -eq $wantMajor -and $minor -ge $wantMinor) { return $true }
  return $false
}

function Test-WingetAvailable { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }

function Install-WithWinget($packageId, $label) {
  if (-not (Test-WingetAvailable)) { return $false }
  Write-Note "winget install --id $packageId"
  try {
    Invoke-CommandStep -File "winget" -Arguments @(
      "install", "--id", $packageId, "--exact", "--source", "winget",
      "--accept-source-agreements", "--accept-package-agreements"
    )
    return $true
  } catch {
    Write-Warn2 "winget could not install ${label}: $($_.Exception.Message)"
    return $false
  }
}

# Refreshes this process's PATH so a just-installed tool is visible without
# reopening the terminal.
function Update-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $seen = @{}
  $merged = @()
  foreach ($entry in (($machine, $user) -join ";" -split ";")) {
    if (-not $entry) { continue }
    if ($seen.ContainsKey($entry.ToLower())) { continue }
    $seen[$entry.ToLower()] = $true
    $merged += $entry
  }
  $env:Path = ($merged -join ";")
}

# --------------------------------------------------------------------- checks --
function Ensure-Git {
  if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Note "git $((& git --version) -replace '^git version ', '')"
    return
  }
  Write-Warn2 "git is not installed"
  if (Confirm-Answer "Install git with winget?" $true) {
    if (Install-WithWinget "Git.Git" "git") {
      Update-Path
      if (Get-Command git -ErrorAction SilentlyContinue) { return }
      Write-Warn2 "git was installed but is not on PATH yet; reopen the terminal if the next step fails"
      return
    }
  }
  throw "git is required to clone the repository (https://git-scm.com/downloads)"
}

function Ensure-Node {
  $version = Get-VersionOf "node"
  if (Test-VersionAtLeast $version $script:MinNodeMajor $script:MinNodeMinor) {
    Write-Note "node v$version"
    return
  }
  if ($version) {
    Write-Warn2 "node v$version is too old: this project needs $($script:MinNodeMajor).$($script:MinNodeMinor) or newer (Node $($script:RecommendedNode) LTS recommended)"
  } else {
    Write-Warn2 "node is not installed (this project needs $($script:MinNodeMajor).$($script:MinNodeMinor)+, Node $($script:RecommendedNode) LTS recommended)"
  }
  if (Confirm-Answer "Install Node.js LTS with winget?" $true) {
    if (Install-WithWinget "OpenJS.NodeJS.LTS" "Node.js") {
      Update-Path
      $version = Get-VersionOf "node"
      if (Test-VersionAtLeast $version $script:MinNodeMajor $script:MinNodeMinor) {
        Write-Note "node v$version"
        return
      }
      Write-Warn2 "Node.js was installed but this terminal does not see it yet - reopen the terminal and run this script again"
    }
  }
  throw "node $($script:MinNodeMajor).$($script:MinNodeMinor)+ is required; get it from https://nodejs.org"
}

# Yarn comes from corepack when it can, because the repository pins the version
# it wants in package.json ("packageManager"). A global Yarn 1 would ignore that
# pin, so it is deliberately not used when corepack is available.
$script:YarnPrefix = @()
function Ensure-Yarn {
  $global = Get-VersionOf "yarn"
  if ($global -and -not $global.StartsWith("1.")) {
    Write-Note "yarn $global"
    $script:YarnPrefix = @("yarn")
    return
  }
  if ($global) {
    Write-Warn2 "the installed yarn is $global; the repository pins 4.x, so corepack will be used instead"
  }

  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) {
    $pinned = $null
    try { $pinned = (& corepack yarn --version 2>$null | Select-Object -First 1) } catch { $pinned = $null }
    if ($pinned) {
      # `corepack enable` writes shims next to node and may need administrator
      # rights; when it fails, `corepack yarn` still runs the pinned version.
      try { & corepack enable *> $null } catch { }
      $after = Get-VersionOf "yarn"
      if ($after -and -not $after.StartsWith("1.")) {
        Write-Note "yarn $after"
        $script:YarnPrefix = @("yarn")
        return
      }
      Write-Note "corepack yarn $(([string]$pinned).Trim())"
      $script:YarnPrefix = @("corepack", "yarn")
      return
    }
  }

  Write-Warn2 "yarn is not available"
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if ($npm -and (Confirm-Answer "Install Yarn globally with npm?" $true)) {
    Invoke-CommandStep -File "npm" -Arguments @("install", "-g", "yarn")
    $global = Get-VersionOf "yarn"
    if ($global) {
      Write-Note "yarn $global"
      $script:YarnPrefix = @("yarn")
      return
    }
  }
  if ($corepack) {
    throw "corepack is present but could not provide yarn; run 'corepack enable' yourself and try again"
  }
  throw "yarn is required; install it from https://yarnpkg.com/getting-started/install (corepack ships with Node and is the easy way)"
}

function Invoke-Yarn {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$YarnArguments)
  $arguments = @()
  if ($script:YarnPrefix.Count -gt 1) {
    $arguments += $script:YarnPrefix[1..($script:YarnPrefix.Count - 1)]
  }
  $arguments += $YarnArguments
  Invoke-CommandStep -File $script:YarnPrefix[0] -Arguments $arguments
}

function Invoke-YarnLine {
  # The display form of the yarn command, for hints printed to the user.
  return ($script:YarnPrefix -join " ")
}

# --------------------------------------------------------------------- target --
function Test-EmptyDir($path) {
  if (-not (Test-Path -LiteralPath $path)) { return $true }
  $items = Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue
  return -not $items
}

function Test-RepoIn($path) {
  if (-not (Test-Path -LiteralPath (Join-Path $path ".git"))) { return $false }
  try {
    & git -C $path remote get-url origin *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

if ($Help) { Show-Usage; return }

Write-Step "Veloce installer"
Write-Note "Repository: $Repo"
Write-Note "Branch:     $Branch"
if ($script:DryRun) { Write-Note "Mode:       dry run (nothing will be changed)" }

Write-Step "Checking git, Node.js and Yarn"
Ensure-Git
Ensure-Node
Ensure-Yarn

Write-Step "Choosing where to install"
$current = (Get-Location).Path
if ([string]::IsNullOrWhiteSpace($Dir)) {
  if (Test-EmptyDir $current) {
    $Dir = Read-Answer "Install into this directory ($current)?" $current
  } else {
    $Dir = Read-Answer "This directory is not empty. Install into which directory?" (Join-Path $current "veloce-lab")
  }
}
$Dir = [Environment]::ExpandEnvironmentVariables($Dir)
if ($Dir.StartsWith("~")) { $Dir = Join-Path $HOME $Dir.Substring(1).TrimStart("\", "/") }
Write-Note "target: $Dir"

$cloned = $true
if (Test-RepoIn $Dir) {
  if (Confirm-Answer "$Dir already is a Veloce checkout. Update it with git pull instead of cloning?" $true) {
    Write-Step "Updating the existing checkout"
    Invoke-CommandStep -File "git" -Arguments @("-C", $Dir, "fetch", "--prune", "origin")
    Invoke-CommandStep -File "git" -Arguments @("-C", $Dir, "checkout", $Branch)
    Invoke-CommandStep -File "git" -Arguments @("-C", $Dir, "pull", "--ff-only", "origin", $Branch)
    $cloned = $false
  } else {
    $Dir = Read-Answer "Clone into which other directory?" "$Dir-2"
  }
} elseif ((Test-Path -LiteralPath $Dir) -and -not (Test-EmptyDir $Dir)) {
  if (-not (Confirm-Answer "$Dir is not empty; cloning into it may overwrite files. Continue?" $false)) {
    $Dir = Read-Answer "Clone into which other directory?" "$Dir-2"
  }
}

if ($cloned) {
  Write-Step "Cloning $Repo into $Dir"
  $parent = Split-Path -Parent $Dir
  if ($parent -and -not $script:DryRun) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Invoke-CommandStep -File "git" -Arguments @("clone", "--branch", $Branch, "--depth", "1", $Repo, $Dir)
  if (-not $script:DryRun -and -not (Test-Path -LiteralPath (Join-Path $Dir ".git"))) {
    throw "cloning failed; run 'git clone --branch $Branch $Repo $Dir' yourself to see why"
  }
}

Write-Step "Installing dependencies"
if ($script:DryRun) { Write-Note "(dry run) cd $Dir" } else { Set-Location -LiteralPath $Dir }

# yumeri.json is this deployment's own configuration, deliberately untracked, so
# a fresh clone has none and the server - which reads exactly <cwd>\yumeri.json -
# would refuse to start. Materialise it from the template kept in scripts\.
#
# Edits go through node rather than a regex, so a comma or a quote in a password
# cannot corrupt the file.
function Set-ConfigValue {
  param([string]$Port = "", [string]$Username = "", [string]$Password = "")
  if ($script:DryRun) { Write-Note "(dry run) patch yumeri.json (port='$Port' user='$Username')"; return }
  $patchScript = @'
const fs = require("fs");
const [file, port, username, password] = process.argv.slice(1);
const config = JSON.parse(fs.readFileSync(file, "utf8"));
if (port) config.core.port = Number(port);
if (username && password) config.plugins["@velocelab/auth"] = { username, password, email: "" };
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
'@
  & node -e $patchScript "yumeri.json" $Port $Username $Password
  if ($LASTEXITCODE -ne 0) { Write-Warn2 "could not update yumeri.json; edit it by hand" }
}

Write-Step "Preparing the configuration"
$configPath = Join-Path $Dir "yumeri.json"
$createdConfig = $false
if ($script:DryRun) {
  Write-Note "(dry run) copy scripts\yumeri.json to yumeri.json when it is missing"
} elseif (Test-Path -LiteralPath $configPath) {
  Write-Note "keeping the existing yumeri.json"
} elseif (Test-Path -LiteralPath (Join-Path $Dir "scripts\yumeri.json")) {
  Copy-Item -LiteralPath (Join-Path $Dir "scripts\yumeri.json") -Destination $configPath
  $createdConfig = $true
  Write-Note "wrote yumeri.json from scripts\yumeri.json"
} else {
  throw "scripts\yumeri.json is missing; there is no configuration to start from"
}

if ($createdConfig) {
  Write-Host ""
  Write-Note "By default the dashboard has no login: whoever can reach the port is the"
  Write-Note "deployment's administrator. Set an account if others can reach this machine."
  if (Confirm-Answer "Require a login for the dashboard?" $false) {
    $adminUser = Read-Answer "Administrator username" "admin"
    $adminPassword = ""
    while ([string]::IsNullOrEmpty($adminPassword)) {
      try {
        $secure = Read-Host -Prompt "Administrator password" -AsSecureString
        $adminPassword = [System.Net.NetworkCredential]::new("", $secure).Password
      } catch {
        Write-Warn2 "no console to read a password on"
        break
      }
      if ([string]::IsNullOrEmpty($adminPassword)) { Write-Warn2 "a password is required" }
    }
    if (-not [string]::IsNullOrEmpty($adminPassword)) {
      Set-ConfigValue -Username $adminUser -Password $adminPassword
      Write-Note "auth enabled for '$adminUser'; the password lives in yumeri.json, which is not committed"
    }
  } else {
    Write-Note "auth stays off: no account, no login"
  }
}

Invoke-Yarn install

if ($Port -eq 0) {
  $detected = 3000
  if ((Test-Path -LiteralPath $configPath) -and -not $script:DryRun) {
    $match = [regex]::Match((Get-Content -LiteralPath $configPath -Raw), '"port"\s*:\s*(\d+)')
    if ($match.Success) { $detected = [int]$match.Groups[1].Value }
  }
  Write-Host ""
  $Port = [int](Read-Answer "Which port should the server listen on?" $detected)
}
if ($Port -eq 0) { $Port = 3000 }

$currentPort = 0
if ((-not $script:DryRun) -and (Test-Path -LiteralPath $configPath)) {
  $match = [regex]::Match((Get-Content -LiteralPath $configPath -Raw), '"port"\s*:\s*(\d+)')
  if ($match.Success) { $currentPort = [int]$match.Groups[1].Value }
}
if ($currentPort -ne $Port) {
  Write-Note "setting the port in yumeri.json to $Port"
  Set-ConfigValue -Port "$Port"
}

if ($NoStart) {
  Write-Step "Done"
  Write-Note "Dependencies installed in $Dir."
  Write-Note "Start it with:  cd $Dir; $(Invoke-YarnLine) dev"
  return
}

if ([string]::IsNullOrWhiteSpace($Mode)) {
  Write-Host ""
  Write-Host "How should it start?"
  Write-Note "1) dev  - no build step, frontend served on the fly (recommended first run)"
  Write-Note "2) prod - run the full build first, then start (slower, for a deployment)"
  $choice = Read-Answer "Choose 1 or 2" "1"
  $Mode = if ($choice -match '^(2|prod|production)$') { "prod" } else { "dev" }
} elseif ($Mode -match '^(2|prod|production)$') {
  $Mode = "prod"
} elseif ($Mode -match '^(1|dev|development)$') {
  $Mode = "dev"
} else {
  Write-Warn2 "unknown mode '$Mode'; using dev"
  $Mode = "dev"
}

$startCommand = "dev"
if ($Mode -eq "prod") {
  Write-Step "Building all packages"
  Invoke-Yarn build
  $startCommand = "start"
}

Write-Step "Starting Veloce"
Write-Note "cd $Dir; $(Invoke-YarnLine) $startCommand"
Write-Note "http://localhost:$Port"
Write-Host ""
Write-Note "Press Ctrl+C to stop the server."
if ($script:DryRun) {
  Write-Note "(dry run) nothing was started"
  return
}

Invoke-Yarn $startCommand