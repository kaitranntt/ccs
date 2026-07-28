# CCS - Claude Codex Switch (Bootstrap)
# Delegates to Node.js implementation via npx
# https://github.com/kaitranntt/ccs

param(
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"
$PACKAGE = "@kaitranntt/ccs"
$MIN_NODE_VERSION = 14

# Check Node.js installed
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Host "[X] Node.js not found"
    Write-Host "    Install: https://nodejs.org (LTS recommended)"
    exit 127
}

# Check Node.js version (major only)
$NodeVersion = (node -v) -replace '^v', '' -split '\.' | Select-Object -First 1
if ([int]$NodeVersion -lt $MIN_NODE_VERSION) {
    Write-Host "[X] Node.js $MIN_NODE_VERSION+ required (found: $(node -v))"
    Write-Host "    Update: https://nodejs.org"
    exit 1
}

# Check npm/npx available
$NpxCmd = Get-Command npx -ErrorAction SilentlyContinue
if (-not $NpxCmd) {
    Write-Host "[X] npx not found (requires npm 5.2+)"
    exit 127
}

# Execute via npx (auto-installs if needed)
& npx $PACKAGE @RemainingArgs
exit $LASTEXITCODE
