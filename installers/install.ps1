# CCS Installation Script (Windows PowerShell)
# https://github.com/kaitranntt/ccs

param(
    [string]$InstallDir = "$env:USERPROFILE\.ccs"
)

$ErrorActionPreference = "Stop"

# Configuration
$CcsDir = "$env:USERPROFILE\.ccs"
$ClaudeDir = "$env:USERPROFILE\.claude"
$GlmModel = "glm-4.6"
$KimiModel = "kimi-for-coding"

# Detect if running from git repository or standalone
$ScriptDir = if ($MyInvocation.MyCommand.Path) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
} else {
    # Running via irm | iex (in-memory, no file path)
    $null
}

$InstallMethod = if ($ScriptDir -and ((Test-Path "$ScriptDir\lib\ccs.ps1") -or (Test-Path "$ScriptDir\..\lib\ccs.ps1"))) {
    "git"
} else {
    "standalone"
}

# Version configuration
# IMPORTANT: Update this version when releasing new versions!
# This hardcoded version is used for standalone installations (irm | iex)
# For git installations, VERSION file is read if available
$CcsVersion = "4.3.6"

# Try to read VERSION file for git installations
if ($ScriptDir) {
    $VersionFile = if (Test-Path "$ScriptDir\VERSION") {
        "$ScriptDir\VERSION"
    } elseif (Test-Path "$ScriptDir\..\VERSION") {
        "$ScriptDir\..\VERSION"
    } else {
        $null
    }

    if ($VersionFile -and (Test-Path $VersionFile)) {
        $CcsVersion = (Get-Content $VersionFile -Raw).Trim()
    }
}

# --- Color/Format Functions ---
function Write-Critical {
    param([string]$Message)
    Write-Host ""
    Write-Host "╔═════════════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║  ACTION REQUIRED                            ║" -ForegroundColor Red
    Write-Host "╚═════════════════════════════════════════════╝" -ForegroundColor Red
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host ""
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host ""
    Write-Host "[!] WARNING" -ForegroundColor Yellow
    Write-Host $Message -ForegroundColor Yellow
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "[i] $Message"
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "===== $Title =====" -ForegroundColor Cyan
    Write-Host ""
}

# Helper Functions

function Detect-CurrentProvider {
    $SettingsFile = "$ClaudeDir\settings.json"
    if (-not (Test-Path $SettingsFile)) {
        return "unknown"
    }

    try {
        $Content = Get-Content $SettingsFile -Raw
        if ($Content -match "api\.kimi\.com|kimi-for-coding") {
            return "kimi"
        } elseif ($Content -match "api\.z\.ai|glm-4") {
            return "glm"
        } elseif ($Content -match "ANTHROPIC_BASE_URL" -and $Content -notmatch "api\.z\.ai|api\.kimi\.com") {
            return "custom"
        } else {
            return "claude"
        }
    } catch {
        return "unknown"
    }
}

function New-GlmTemplate {
    $Template = @{
        env = @{
            ANTHROPIC_BASE_URL = "https://api.z.ai/api/anthropic"
            ANTHROPIC_AUTH_TOKEN = "YOUR_GLM_API_KEY_HERE"
            ANTHROPIC_MODEL = $GlmModel
            ANTHROPIC_DEFAULT_OPUS_MODEL = $GlmModel
            ANTHROPIC_DEFAULT_SONNET_MODEL = $GlmModel
            ANTHROPIC_DEFAULT_HAIKU_MODEL = $GlmModel
        }
    }
    return $Template | ConvertTo-Json -Depth 10
}

function New-GlmProfile {
    param([string]$Provider)

    $CurrentSettings = "$ClaudeDir\settings.json"
    $GlmSettings = "$CcsDir\glm.settings.json"

    if ($Provider -eq "glm" -and (Test-Path $CurrentSettings)) {
        Write-Host "[OK] Copying current GLM config to profile..."

        try {
            $Config = Get-Content $CurrentSettings -Raw | ConvertFrom-Json
            if (-not $Config.env) {
                $Config | Add-Member -NotePropertyName env -NotePropertyValue @{} -Force
            }
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_DEFAULT_OPUS_MODEL -NotePropertyValue $GlmModel -Force
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_DEFAULT_SONNET_MODEL -NotePropertyValue $GlmModel -Force
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_DEFAULT_HAIKU_MODEL -NotePropertyValue $GlmModel -Force

            $Config | ConvertTo-Json -Depth 10 | Set-Content $GlmSettings
            Write-Host "  Created: $GlmSettings with your existing API key + enhanced settings"
        } catch {
            Write-Host "  [i]  Copying current settings failed, using template"
            New-GlmTemplate | Set-Content $GlmSettings
        }
    } else {
        Write-Host "Creating GLM profile template at $GlmSettings"
        New-GlmTemplate | Set-Content $GlmSettings
        Write-Host "  Created: $GlmSettings"
        Write-Host "  [!]  Edit this file and replace YOUR_GLM_API_KEY_HERE with your actual GLM API key"
    }
}

function New-KimiTemplate {
    $Template = @{
        env = @{
            ANTHROPIC_BASE_URL = "https://api.kimi.com/coding/"
            ANTHROPIC_AUTH_TOKEN = "YOUR_KIMI_API_KEY_HERE"
            ANTHROPIC_MODEL = $KimiModel
            ANTHROPIC_SMALL_FAST_MODEL = $KimiModel
            ANTHROPIC_DEFAULT_OPUS_MODEL = $KimiModel
            ANTHROPIC_DEFAULT_SONNET_MODEL = $KimiModel
            ANTHROPIC_DEFAULT_HAIKU_MODEL = $KimiModel
        }
        alwaysThinkingEnabled = $true
    }
    return $Template | ConvertTo-Json -Depth 10
}

function New-KimiProfile {
    param([string]$Provider)

    $CurrentSettings = "$ClaudeDir\settings.json"
    $KimiSettings = "$CcsDir\kimi.settings.json"

    if ($Provider -eq "kimi" -and (Test-Path $CurrentSettings)) {
        Write-Host "[OK] Copying current Kimi config to profile..."

        try {
            $Config = Get-Content $CurrentSettings -Raw | ConvertFrom-Json
            if (-not $Config.env) {
                $Config | Add-Member -NotePropertyName env -NotePropertyValue @{} -Force
            }
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_SMALL_FAST_MODEL -NotePropertyValue $KimiModel -Force
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_DEFAULT_OPUS_MODEL -NotePropertyValue $KimiModel -Force
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_DEFAULT_SONNET_MODEL -NotePropertyValue $KimiModel -Force
            $Config.env | Add-Member -NotePropertyName ANTHROPIC_DEFAULT_HAIKU_MODEL -NotePropertyValue $KimiModel -Force
            $Config | Add-Member -NotePropertyName alwaysThinkingEnabled -NotePropertyValue $true -Force

            $Config | ConvertTo-Json -Depth 10 | Set-Content $KimiSettings
            Write-Host "  Created: $KimiSettings with your existing API key + enhanced settings"
        } catch {
            Write-Host "  [i]  Copying current settings failed, using template"
            New-KimiTemplate | Set-Content $KimiSettings
        }
    } else {
        Write-Host "Creating Kimi profile template at $KimiSettings"
        New-KimiTemplate | Set-Content $KimiSettings
        Write-Host "  Created: $KimiSettings"
        Write-Host "  [!]  Edit this file and replace YOUR_KIMI_API_KEY_HERE with your actual Kimi API key"
    }
}

function Install-ClaudeFolder {
    param(
        [string]$SourceDir
    )

    $TargetDir = "$CcsDir\.claude"

    # Check if already exists
    if (Test-Path $TargetDir) {
        Write-Host "|  [i]  .claude/ folder already exists, skipping"
        return $true
    }

    # Create directory structure
    $null = New-Item -ItemType Directory -Force -Path "$TargetDir\commands"
    $null = New-Item -ItemType Directory -Force -Path "$TargetDir\skills\ccs-delegation\references"

    if ($InstallMethod -eq "git" -and $SourceDir) {
        # Copy from local git repo
        $SourceClaudeDir = Join-Path $SourceDir ".claude"
        if (Test-Path $SourceClaudeDir) {
            try {
                Copy-Item -Path "$SourceClaudeDir\*" -Destination $TargetDir -Recurse -Force
                Write-Host "|  [OK] Installed .claude/ folder"
                return $true
            } catch {
                Write-Host "|  [!]  Failed to copy .claude/ folder"
                return $false
            }
        } else {
            Write-Host "|  [!]  .claude/ folder not found in source"
            return $false
        }
    } else {
        # Standalone: download from GitHub
        try {
            $BaseUrl = "https://raw.githubusercontent.com/kaitranntt/ccs/main/.claude"

            Invoke-WebRequest -Uri "$BaseUrl/commands/ccs.md" `
                -OutFile "$TargetDir\commands\ccs.md" -UseBasicParsing
            Invoke-WebRequest -Uri "$BaseUrl/skills/ccs-delegation/SKILL.md" `
                -OutFile "$TargetDir\skills\ccs-delegation\SKILL.md" -UseBasicParsing
            Invoke-WebRequest -Uri "$BaseUrl/skills/ccs-delegation/references/delegation-patterns.md" `
                -OutFile "$TargetDir\skills\ccs-delegation\references\delegation-patterns.md" -UseBasicParsing

            Write-Host "|  [OK] Downloaded .claude/ folder"
            return $true
        } catch {
            Write-Host "|  [!]  Failed to download .claude/ folder"
            return $false
        }
    }
}

# Main Installation

Write-Host '===== Installing CCS (Windows) ====='

# Create directories
New-Item -ItemType Directory -Force -Path $CcsDir | Out-Null

# Install main executable
if ($InstallMethod -eq "standalone") {
    # Standalone install - download from GitHub
    Write-Host "|  Downloading CCS from GitHub..."

    try {
        $BaseUrl = "https://raw.githubusercontent.com/kaitranntt/ccs/main"
        Invoke-WebRequest -Uri "$BaseUrl/lib/ccs.ps1" -OutFile "$CcsDir\ccs.ps1" -UseBasicParsing
        Write-Host "|  [OK] Downloaded ccs.ps1"

        # Download required dependencies
        $LibDir = "$CcsDir\lib"
        if (-not (Test-Path $LibDir)) {
            New-Item -ItemType Directory -Path $LibDir -Force | Out-Null
        }

        try {
            Invoke-WebRequest -Uri "$BaseUrl/lib/error-codes.ps1" -OutFile "$LibDir\error-codes.ps1" -UseBasicParsing
            Write-Host "|  [OK] Downloaded error-codes.ps1"
        } catch {
            Write-Host "|  [!]  Warning: Failed to download error-codes.ps1"
        }

        try {
            Invoke-WebRequest -Uri "$BaseUrl/lib/progress-indicator.ps1" -OutFile "$LibDir\progress-indicator.ps1" -UseBasicParsing
            Write-Host "|  [OK] Downloaded progress-indicator.ps1"
        } catch {
            Write-Host "|  [!]  Warning: Failed to download progress-indicator.ps1"
        }

        try {
            Invoke-WebRequest -Uri "$BaseUrl/lib/prompt.ps1" -OutFile "$LibDir\prompt.ps1" -UseBasicParsing
            Write-Host "|  [OK] Downloaded prompt.ps1"
        } catch {
            Write-Host "|  [!]  Warning: Failed to download prompt.ps1"
        }

        # Download shell completion files
        $CompletionsDir = "$CcsDir\completions"
        if (-not (Test-Path $CompletionsDir)) {
            New-Item -ItemType Directory -Path $CompletionsDir -Force | Out-Null
        }

        try {
            Invoke-WebRequest -Uri "$BaseUrl/scripts/completion/ccs.ps1" -OutFile "$CompletionsDir\ccs.ps1" -UseBasicParsing
            Write-Host "|  [OK] Downloaded completion files"
        } catch {
            Write-Host "|  [!]  Warning: Failed to download completion files"
        }
    } catch {
        Write-Host "|"
        Write-Host "[X] Error: Failed to download ccs.ps1 from GitHub" -ForegroundColor Red
        Write-Host "  $_"
        return
    }
} else {
    # Git install - copy local file
    $CcsPs1Path = if (Test-Path "$ScriptDir\lib\ccs.ps1") {
        "$ScriptDir\lib\ccs.ps1"
    } elseif (Test-Path "$ScriptDir\..\lib\ccs.ps1") {
        "$ScriptDir\..\lib\ccs.ps1"
    } else {
        throw "lib\ccs.ps1 not found"
    }
    Copy-Item $CcsPs1Path "$CcsDir\ccs.ps1" -Force
    Write-Host "|  [OK] Installed ccs.ps1"

    # Copy required dependencies
    $LibDir = "$CcsDir\lib"
    if (-not (Test-Path $LibDir)) {
        New-Item -ItemType Directory -Path $LibDir -Force | Out-Null
    }

    $SourceLibDir = if (Test-Path "$ScriptDir\lib") {
        "$ScriptDir\lib"
    } elseif (Test-Path "$ScriptDir\..\lib") {
        "$ScriptDir\..\lib"
    } else {
        $null
    }

    if ($SourceLibDir) {
        if (Test-Path "$SourceLibDir\error-codes.ps1") {
            Copy-Item "$SourceLibDir\error-codes.ps1" "$LibDir\error-codes.ps1" -Force
            Write-Host "|  [OK] Copied error-codes.ps1"
        }

        if (Test-Path "$SourceLibDir\progress-indicator.ps1") {
            Copy-Item "$SourceLibDir\progress-indicator.ps1" "$LibDir\progress-indicator.ps1" -Force
            Write-Host "|  [OK] Copied progress-indicator.ps1"
        }

        if (Test-Path "$SourceLibDir\prompt.ps1") {
            Copy-Item "$SourceLibDir\prompt.ps1" "$LibDir\prompt.ps1" -Force
            Write-Host "|  [OK] Copied prompt.ps1"
        }
    }

    # Copy shell completion files
    $CompletionsDir = "$CcsDir\completions"
    if (-not (Test-Path $CompletionsDir)) {
        New-Item -ItemType Directory -Path $CompletionsDir -Force | Out-Null
    }

    $SourceCompletionDir = if (Test-Path "$ScriptDir\scripts\completion") {
        "$ScriptDir\scripts\completion"
    } elseif (Test-Path "$ScriptDir\..\scripts\completion") {
        "$ScriptDir\..\scripts\completion"
    } else {
        $null
    }

    if ($SourceCompletionDir -and (Test-Path "$SourceCompletionDir\ccs.ps1")) {
        Copy-Item "$SourceCompletionDir\ccs.ps1" "$CompletionsDir\ccs.ps1" -Force -ErrorAction SilentlyContinue
        Write-Host "|  [OK] Copied completion files"
    }
}

# Install uninstall script as ccs-uninstall.ps1
if ($ScriptDir -and (Test-Path "$ScriptDir\uninstall.ps1")) {
    # Copy uninstall.ps1 as ccs-uninstall.ps1 (similar to Linux symlink approach)
    if ($ScriptDir -ne $CcsDir) {
        Copy-Item "$ScriptDir\uninstall.ps1" "$CcsDir\ccs-uninstall.ps1" -Force
    }
    # Clean up old uninstall.ps1 from previous installations
    if (Test-Path "$CcsDir\uninstall.ps1") {
        Remove-Item "$CcsDir\uninstall.ps1" -Force -ErrorAction SilentlyContinue
    }
    Write-Host "|  [OK] Installed uninstaller"
} elseif ($InstallMethod -eq "standalone") {
    try {
        $BaseUrl = "https://raw.githubusercontent.com/kaitranntt/ccs/main"
        # Download uninstall.ps1 as ccs-uninstall.ps1
        Invoke-WebRequest -Uri "$BaseUrl/installers/uninstall.ps1" -OutFile "$CcsDir\ccs-uninstall.ps1" -UseBasicParsing
        # Clean up old uninstall.ps1 from previous installations
        if (Test-Path "$CcsDir\uninstall.ps1") {
            Remove-Item "$CcsDir\uninstall.ps1" -Force -ErrorAction SilentlyContinue
        }
        Write-Host "|  [OK] Installed uninstaller"
    } catch {
        Write-Host "|  [!]  Could not download uninstaller (optional)"
    }
}

Write-Host "|  [OK] Created directories"

# Install .claude/ folder
if ($InstallMethod -eq "git" -and $ScriptDir) {
    $ParentDir = Split-Path -Parent $ScriptDir
    $null = Install-ClaudeFolder -SourceDir $ParentDir
} else {
    $null = Install-ClaudeFolder -SourceDir ""
}

Write-Host "========================================="
Write-Host ""

# Profile Setup

$CurrentProvider = Detect-CurrentProvider

$ProviderLabel = switch ($CurrentProvider) {
    "glm" { ' (detected: GLM)' }
    "kimi" { ' (detected: Kimi)' }
    "claude" { ' (detected: Claude)' }
    "custom" { ' (detected: custom)' }
    default { "" }
}

Write-Host "===== Configuring Profiles v$CcsVersion$ProviderLabel"

# Backup existing config (single backup, no timestamp)
$ConfigFile = "$CcsDir\config.json"
$BackupFile = "$CcsDir\config.json.backup"
if (Test-Path $ConfigFile) {
    Copy-Item $ConfigFile $BackupFile -Force
}

$NeedsGlmKey = $false
$GlmSettings = "$CcsDir\glm.settings.json"

# Create GLM profile if missing
if (-not (Test-Path $GlmSettings)) {
    New-GlmProfile -Provider $CurrentProvider
    if ($CurrentProvider -ne "glm") {
        $NeedsGlmKey = $true
    }
} else {
    Write-Host '|  [OK] GLM profile exists'
}

$NeedsKimiKey = $false
$KimiSettings = "$CcsDir\kimi.settings.json"

# Create Kimi profile if missing
if (-not (Test-Path $KimiSettings)) {
    New-KimiProfile -Provider $CurrentProvider
    if ($CurrentProvider -ne "kimi") {
        $NeedsKimiKey = $true
    }
} else {
    Write-Host '|  [OK] Kimi profile exists'
}

# Create config if missing
if (-not (Test-Path $ConfigFile)) {
    $ConfigContent = @{
        profiles = @{
            glm = "~/.ccs/glm.settings.json"
            kimi = "~/.ccs/kimi.settings.json"
            default = "~/.claude/settings.json"
        }
    }
    $ConfigContent | ConvertTo-Json -Depth 10 | Set-Content $ConfigFile
    Write-Host ('|  OK: Config created at {0}\.ccs\config.json' -f $env:USERPROFILE)
}

# Validate config JSON
if (Test-Path $ConfigFile) {
    try {
        $null = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    } catch {
        Write-Host '|  [!]  Warning: Invalid JSON in config.json' -ForegroundColor Yellow
        if (Test-Path $BackupFile) {
            Write-Host ('|     Restore from: {0}' -f $BackupFile)
        }
    }
}

# Validate GLM settings JSON
if (Test-Path $GlmSettings) {
    try {
        $null = Get-Content $GlmSettings -Raw | ConvertFrom-Json
    } catch {
        Write-Host '|  [!]  Warning: Invalid JSON in glm.settings.json' -ForegroundColor Yellow
    }
}

Write-Host "========================================="
Write-Host ""

# Detect circular symlink
function Test-CircularSymlink {
    param(
        [string]$Target,
        [string]$LinkPath
    )

    # Check if target exists and is symlink
    if (-not (Test-Path $Target)) {
        return $false
    }

    try {
        $Item = Get-Item $Target -ErrorAction Stop
        if ($Item.LinkType -ne "SymbolicLink") {
            return $false
        }

        # Resolve target's link
        $TargetLink = $Item.Target
        $SharedDir = "$env:USERPROFILE\.ccs\shared"

        # Check if target points back to our shared dir
        if ($TargetLink -like "$SharedDir*" -or $TargetLink -eq $LinkPath) {
            Write-Host "[!] Circular symlink detected: $Target → $TargetLink"
            return $true
        }
    } catch {
        return $false
    }

    return $false
}

# Setup shared directories as symlinks to ~/.claude/ (v3.2.0)
function Initialize-SharedSymlinks {
    $SharedDir = "$CcsDir\shared"
    $ClaudeDir = "$env:USERPROFILE\.claude"

    # Create ~/.claude/ if missing
    if (-not (Test-Path $ClaudeDir)) {
        Write-Host "[i] Creating ~/.claude/ directory structure"
        New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
        @('commands', 'skills', 'agents') | ForEach-Object {
            New-Item -ItemType Directory -Path "$ClaudeDir\$_" -Force | Out-Null
        }
    }

    # Create shared directory
    if (-not (Test-Path $SharedDir)) {
        New-Item -ItemType Directory -Path $SharedDir -Force | Out-Null
    }

    # Create symlinks ~/.ccs/shared/* → ~/.claude/*
    foreach ($Dir in @('commands', 'skills', 'agents')) {
        $ClaudePath = "$ClaudeDir\$Dir"
        $SharedPath = "$SharedDir\$Dir"

        # Create directory in ~/.claude/ if missing
        if (-not (Test-Path $ClaudePath)) {
            New-Item -ItemType Directory -Path $ClaudePath -Force | Out-Null
        }

        # Check for circular symlink
        if (Test-CircularSymlink -Target $ClaudePath -LinkPath $SharedPath) {
            Write-Host "[!] Skipping $Dir`: circular symlink detected"
            continue
        }

        # If already correct symlink, skip
        if (Test-Path $SharedPath) {
            try {
                $Item = Get-Item $SharedPath -ErrorAction Stop
                if ($Item.LinkType -eq "SymbolicLink") {
                    $CurrentTarget = $Item.Target
                    if ($CurrentTarget -eq $ClaudePath) {
                        continue  # Already correct
                    }
                }
                # Backup existing data before replacing
                if ((Get-ChildItem $SharedPath -ErrorAction SilentlyContinue).Count -gt 0) {
                    Write-Host "[i] Migrating existing $Dir to ~/.claude/$Dir"
                    Get-ChildItem $SharedPath -ErrorAction SilentlyContinue | ForEach-Object {
                        $DestPath = Join-Path $ClaudePath $_.Name
                        if (-not (Test-Path $DestPath)) {
                            Copy-Item $_.FullName $DestPath -Recurse -ErrorAction SilentlyContinue
                        }
                    }
                }
                Remove-Item $SharedPath -Recurse -Force -ErrorAction SilentlyContinue
            } catch {
                # Continue to recreate
            }
        }

        # Create symlink (requires Developer Mode or admin)
        try {
            New-Item -ItemType SymbolicLink -Path $SharedPath -Target $ClaudePath -Force -ErrorAction Stop | Out-Null
        } catch {
            Write-Host "[!] Symlink failed for $Dir, copying instead (enable Developer Mode)"
            if (-not (Test-Path $SharedPath)) {
                New-Item -ItemType Directory -Path $SharedPath -Force | Out-Null
            }
            if (Test-Path $ClaudePath) {
                Copy-Item "$ClaudePath\*" $SharedPath -Recurse -ErrorAction SilentlyContinue
            }
        }
    }
}

Write-Host "[i] Setting up shared directories..."
Initialize-SharedSymlinks
Write-Host ""

# Install CCS items to ~/.claude/ via symlinks (v4.1.0)
Write-Host "[i] Installing CCS items to ~/.claude/..."
if (Get-Command node -ErrorAction SilentlyContinue) {
    # Check if .claude/ was successfully installed
    if (Test-Path "$CcsDir\.claude") {
        # Download or copy claude-symlink-manager.js
        $UtilsDir = "$CcsDir\bin\utils"
        if (-not (Test-Path $UtilsDir)) {
            New-Item -ItemType Directory -Path $UtilsDir -Force | Out-Null
        }

        if ($InstallMethod -eq "git" -and $ScriptDir) {
            # Git install - copy from local repo
            $SourcePath = $null
            if (Test-Path "$ScriptDir\..\bin\utils\claude-symlink-manager.js") {
                $SourcePath = "$ScriptDir\..\bin\utils\claude-symlink-manager.js"
            } elseif (Test-Path "$ScriptDir\bin\utils\claude-symlink-manager.js") {
                $SourcePath = "$ScriptDir\bin\utils\claude-symlink-manager.js"
            }

            if ($SourcePath) {
                Copy-Item $SourcePath "$UtilsDir\claude-symlink-manager.js" -Force
            }
        } else {
            # Standalone install - download from GitHub
            try {
                Invoke-WebRequest -Uri "https://raw.githubusercontent.com/kaitranntt/ccs/main/bin/utils/claude-symlink-manager.js" `
                    -OutFile "$UtilsDir\claude-symlink-manager.js" -UseBasicParsing
            } catch {
                Write-Host "[!] Failed to download claude-symlink-manager.js"
            }
        }

        # Call ClaudeSymlinkManager if available
        if (Test-Path "$UtilsDir\claude-symlink-manager.js") {
            try {
                $scriptBlock = @"
                try {
                    const ClaudeSymlinkManager = require('$($UtilsDir -replace '\\', '/')/claude-symlink-manager.js');
                    const manager = new ClaudeSymlinkManager();
                    manager.install();
                } catch (err) {
                    console.log('[!] CCS item installation warning: ' + err.message);
                    console.log('    Run "ccs sync" to retry');
                }
"@
                node -e $scriptBlock 2>$null
                if (-not $?) {
                    Write-Host "[!] CCS item installation skipped (run 'ccs sync' later)"
                }
            } catch {
                Write-Host "[!] CCS item installation failed: $($_.Exception.Message)"
                Write-Host "    Run 'ccs sync' after installation to complete setup"
            }
        } else {
            Write-Host "[!] claude-symlink-manager.js not found, skipping"
            Write-Host "    Run 'ccs sync' after installation to complete setup"
        }
    } else {
        Write-Host "[!] .claude/ folder not found, skipping CCS item installation"
    }
} else {
    Write-Host "[!] Node.js not found, skipping CCS item installation"
    Write-Host "    Install Node.js and run 'ccs sync' to complete setup"
}
Write-Host ""
Write-Host "[i] Note: Windows symlink support requires Developer Mode (v4.2 will add fallback)"
Write-Host ""

# Check and update PATH
$UserPath = [Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
if ($UserPath -notlike "*$CcsDir*") {
    Write-Host "[!]  PATH Configuration Required"
    Write-Host ""
    Write-Host "   Adding $CcsDir to your PATH..."

    try {
        $NewPath = if ($UserPath) { "$UserPath;$CcsDir" } else { $CcsDir }
        [Environment]::SetEnvironmentVariable("Path", $NewPath, [System.EnvironmentVariableTarget]::User)

        Write-Host "   [OK] PATH updated. Restart your terminal for changes to take effect."
        Write-Host ""
    } catch {
        Write-Host "   [X] Could not update PATH automatically." -ForegroundColor Yellow
        Write-Host "   Please add manually: $CcsDir"
        Write-Host ""
    }
}

# Show API key warning if needed
if ($NeedsGlmKey) {
    Write-Critical @"
Configure GLM API Key:

    1. Get API key from: https://api.z.ai

    2. Edit: $env:USERPROFILE\.ccs\glm.settings.json

    3. Replace: YOUR_GLM_API_KEY_HERE
       With your actual API key

    4. Test: ccs glm --version
"@
}

# Show API key warning for Kimi if needed
if ($NeedsKimiKey) {
    Write-Critical @"
Configure Kimi API Key:

    1. Get API key from: https://www.kimi.com/coding

    2. Edit: $env:USERPROFILE\.ccs\kimi.settings.json

    3. Replace: YOUR_KIMI_API_KEY_HERE
       With your actual API key

    4. Test: ccs kimi --version
"@
}

Write-Success "CCS installed successfully!"
Write-Host ""
Write-Host "   Installed components:"
Write-Host "     * ccs command        -> $CcsDir\ccs.ps1"
Write-Host "     * config             -> $CcsDir\config.json"
Write-Host "     * glm profile        -> $CcsDir\glm.settings.json"
Write-Host "     * kimi profile       -> $CcsDir\kimi.settings.json"
Write-Host "     * .claude/ folder    -> $CcsDir\.claude\"
Write-Host ""
Write-Host "   Quick start:"
Write-Host "     ccs           # Use Claude subscription (default)"
Write-Host "     ccs glm       # Use GLM fallback"
Write-Host "     ccs kimi      # Use Kimi for Coding"
Write-Host ""
Write-Host ""
Write-Host "   To uninstall: ccs-uninstall"
Write-Host ""
