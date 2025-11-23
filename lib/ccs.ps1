# CCS - Claude Code Switch (Windows PowerShell)
# Cross-platform Claude CLI profile switcher
# https://github.com/kaitranntt/ccs

param(
    [switch]$Help,
    [switch]$Version,
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$RemainingArgs
)

$ErrorActionPreference = "Stop"

# Version (updated by scripts/bump-version.sh)
$CcsVersion = "4.3.6"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = if ($env:CCS_CONFIG) { $env:CCS_CONFIG } else { "$env:USERPROFILE\.ccs\config.json" }
$ProfilesJson = "$env:USERPROFILE\.ccs\profiles.json"
$InstancesDir = "$env:USERPROFILE\.ccs\instances"

# Determine dependency location (git vs installed)
# Git: lib/ccs.ps1 and dependencies are in same dir (lib/)
# Installed: lib/ccs.ps1 is in ~/.ccs/, dependencies in ~/.ccs/lib/
$DepDir = if (Test-Path "$ScriptDir\error-codes.ps1") {
    # Git install - files in same directory
    $ScriptDir
} else {
    # Standalone install - files in ~/.ccs/lib/
    "$env:USERPROFILE\.ccs\lib"
}

# Source error codes
. "$DepDir\error-codes.ps1"

# Source progress indicators
. "$DepDir\progress-indicator.ps1"

# Source interactive prompts
. "$DepDir\prompt.ps1"

# --- Color/Format Functions ---
function Write-ErrorMsg {
    param([string]$Message)
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host "  ERROR" -ForegroundColor Red
    Write-Host "=============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host $Message -ForegroundColor Red
    Write-Host ""
}

# Calculate Levenshtein distance between two strings
function Get-LevenshteinDistance {
    param(
        [string]$a,
        [string]$b
    )

    $lenA = $a.Length
    $lenB = $b.Length

    if ($lenA -eq 0) { return $lenB }
    if ($lenB -eq 0) { return $lenA }

    # Initialize matrix
    $matrix = New-Object 'int[,]' ($lenB + 1), ($lenA + 1)

    # Initialize first row and column
    for ($i = 0; $i -le $lenB; $i++) {
        $matrix[$i, 0] = $i
    }
    for ($j = 0; $j -le $lenA; $j++) {
        $matrix[0, $j] = $j
    }

    # Fill matrix
    for ($i = 1; $i -le $lenB; $i++) {
        for ($j = 1; $j -le $lenA; $j++) {
            if ($a[$j - 1] -eq $b[$i - 1]) {
                $matrix[$i, $j] = $matrix[$i - 1, $j - 1]
            } else {
                $sub = $matrix[$i - 1, $j - 1]
                $ins = $matrix[$i, $j - 1]
                $del = $matrix[$i - 1, $j]
                $min = [Math]::Min([Math]::Min($sub, $ins), $del)
                $matrix[$i, $j] = $min + 1
            }
        }
    }

    return $matrix[$lenB, $lenA]
}

# Find similar strings using fuzzy matching
function Find-SimilarStrings {
    param(
        [string]$Target,
        [string[]]$Candidates,
        [int]$MaxDistance = 2
    )

    $targetLower = $Target.ToLower()
    $matches = @()

    foreach ($candidate in $Candidates) {
        $candidateLower = $candidate.ToLower()
        $distance = Get-LevenshteinDistance $targetLower $candidateLower

        if ($distance -le $MaxDistance -and $distance -gt 0) {
            $matches += [PSCustomObject]@{
                Name = $candidate
                Distance = $distance
            }
        }
    }

    # Sort by distance and return top 3
    return $matches | Sort-Object Distance | Select-Object -First 3 | ForEach-Object { $_.Name }
}

# Enhanced error message with error codes
function Show-EnhancedError {
    param(
        [string]$ErrorCode,
        [string]$ShortMsg,
        [string]$Context = "",
        [string]$Suggestions = ""
    )

    Write-Host ""
    Write-Host "[X] $ShortMsg" -ForegroundColor Red
    Write-Host ""

    if ($Context) {
        Write-Host $Context
        Write-Host ""
    }

    if ($Suggestions) {
        Write-Host "Solutions:" -ForegroundColor Yellow
        Write-Host $Suggestions
        Write-Host ""
    }

    Write-Host "Error: $ErrorCode" -ForegroundColor Yellow
    Write-Host (Get-ErrorDocUrl $ErrorCode) -ForegroundColor Yellow
    Write-Host ""
}

function Write-ColoredText {
    param(
        [string]$Text,
        [string]$Color = "White",
        [switch]$NoNewline
    )

    $UseColors = $env:FORCE_COLOR -or ([Console]::IsOutputRedirected -eq $false -and -not $env:NO_COLOR)

    if ($UseColors -and $Color) {
        if ($NoNewline) {
            Write-Host $Text -ForegroundColor $Color -NoNewline
        } else {
            Write-Host $Text -ForegroundColor $Color
        }
    } else {
        if ($NoNewline) {
            Write-Host $Text -NoNewline
        } else {
            Write-Host $Text
        }
    }
}

# --- Claude CLI Detection Logic ---

function Find-ClaudeCli {
    if ($env:CCS_CLAUDE_PATH) {
        return $env:CCS_CLAUDE_PATH
    } else {
        return "claude"
    }
}

function Show-ClaudeNotFoundError {
    $Message = "Claude CLI not found in PATH" + "`n`n" +
    "CCS requires Claude CLI to be installed and available in your PATH." + "`n`n" +
    "Solutions:" + "`n" +
    "  1. Install Claude CLI:" + "`n" +
    "     https://docs.claude.com/en/docs/claude-code/installation" + "`n`n" +
    "  2. Verify installation:" + "`n" +
    "     Get-Command claude" + "`n`n" +
    "  3. If installed but not in PATH, add it:" + "`n" +
    "     # Find Claude installation" + "`n" +
    "     where.exe claude" + "`n`n" +
    "     # Or set custom path" + "`n" +
    "     `$env:CCS_CLAUDE_PATH = 'C:\path\to\claude.exe'" + "`n`n" +
    "Restart your terminal after installation."

    Write-ErrorMsg $Message
}

function Show-Help {
    $UseColors = $env:FORCE_COLOR -or ([Console]::IsOutputRedirected -eq $false -and -not $env:NO_COLOR)

    # Helper for colored output
    function Write-ColorLine {
        param([string]$Text, [string]$Color = "White")
        if ($UseColors) { Write-Host $Text -ForegroundColor $Color }
        else { Write-Host $Text }
    }

    Write-ColorLine "CCS (Claude Code Switch) - Instant profile switching for Claude CLI" "White"
    Write-Host ""

    Write-ColorLine "Usage:" "Cyan"
    Write-ColorLine "  ccs [profile] [claude-args...]" "Yellow"
    Write-ColorLine "  ccs [flags]" "Yellow"
    Write-Host ""

    Write-ColorLine "Description:" "Cyan"
    Write-Host "  Switch between multiple Claude accounts and alternative models"
    Write-Host "  (GLM, Kimi) instantly. Run different Claude CLI sessions concurrently"
    Write-Host "  with auto-recovery. Zero downtime."
    Write-Host ""

    Write-ColorLine "Model Switching:" "Cyan"
    Write-ColorLine "  ccs                         Use default Claude account" "Yellow"
    Write-ColorLine "  ccs glm                     Switch to GLM 4.6 model" "Yellow"
    Write-ColorLine "  ccs glmt                    Switch to GLM with thinking mode" "Yellow"
    Write-ColorLine "  ccs glmt --verbose          Enable debug logging" "Yellow"
    Write-ColorLine "  ccs kimi                    Switch to Kimi for Coding" "Yellow"
    Write-ColorLine "  ccs glm 'debug this code'   Use GLM and run command" "Yellow"
    Write-Host ""

    Write-ColorLine "Account Management:" "Cyan"
    Write-ColorLine "  ccs auth --help             Run multiple Claude accounts concurrently" "Yellow"
    Write-Host ""

    Write-ColorLine "Delegation (inside Claude Code CLI):" "Cyan"
    Write-ColorLine "  /ccs `"task`"                Delegate task (auto-selects best profile)" "Yellow"
    Write-ColorLine "  /ccs --glm `"task`"           Force GLM-4.6 for simple tasks" "Yellow"
    Write-ColorLine "  /ccs --kimi `"task`"          Force Kimi for long context" "Yellow"
    Write-ColorLine "  /ccs:continue `"follow-up`"    Continue last delegation session" "Yellow"
    Write-Host "  Save tokens by delegating simple tasks to cost-optimized models"
    Write-Host ""

    Write-ColorLine "Diagnostics:" "Cyan"
    Write-ColorLine "  ccs doctor                  Run health check and diagnostics" "Yellow"
    Write-ColorLine "  ccs sync                    Sync delegation commands and skills" "Yellow"
    Write-ColorLine "  ccs update                  Update CCS to latest version" "Yellow"
    Write-Host ""

    Write-ColorLine "Flags:" "Cyan"
    Write-ColorLine "  -h, --help                  Show this help message" "Yellow"
    Write-ColorLine "  -v, --version               Show version and installation info" "Yellow"
    Write-ColorLine "  -sc, --shell-completion     Install shell auto-completion" "Yellow"
    Write-Host ""

    Write-ColorLine "Configuration:" "Cyan"
    Write-Host "  Config File: ~/.ccs/config.json"
    Write-Host "  Profiles:    ~/.ccs/profiles.json"
    Write-Host "  Instances:   ~/.ccs/instances/"
    Write-Host "  Settings:    ~/.ccs/*.settings.json"
    Write-Host "  Environment: CCS_CONFIG (override config path)"
    Write-Host ""

    Write-ColorLine "Shared Data:" "Cyan"
    Write-Host "  Commands:    ~/.ccs/shared/commands/"
    Write-Host "  Skills:      ~/.ccs/shared/skills/"
    Write-Host "  Agents:      ~/.ccs/shared/agents/"
    Write-Host "  Plugins:     ~/.ccs/shared/plugins/"
    Write-Host "  Note: Commands, skills, agents, and plugins are symlinked across all profiles"
    Write-Host ""

    Write-ColorLine "Examples:" "Cyan"
    Write-ColorLine "  `$ ccs                        # Use default account" "Yellow"
    Write-ColorLine "  `$ ccs glm `"implement API`"    # Cost-optimized model" "Yellow"
    Write-Host ""
    Write-ColorLine "  For more: https://github.com/kaitranntt/ccs/blob/main/README.md" "Cyan"
    Write-Host ""

    Write-ColorLine "Uninstall:" "Yellow"
    Write-Host "  npm:          npm uninstall -g @kaitranntt/ccs"
    Write-Host "  macOS/Linux:  curl -fsSL ccs.kaitran.ca/uninstall | bash"
    Write-Host "  Windows:      irm ccs.kaitran.ca/uninstall | iex"
    Write-Host ""

    Write-ColorLine "Documentation:" "Cyan"
    Write-Host "  GitHub:  https://github.com/kaitranntt/ccs"
    Write-Host "  Docs:    https://github.com/kaitranntt/ccs/blob/main/README.md"
    Write-Host "  Issues:  https://github.com/kaitranntt/ccs/issues"
    Write-Host ""

    Write-ColorLine "License: MIT" "Cyan"
}

function Show-Version {
    $UseColors = $env:FORCE_COLOR -or ([Console]::IsOutputRedirected -eq $false -and -not $env:NO_COLOR)

    # Helper for aligned output
    function Write-TableLine {
        param(
            [string]$Label,
            [string]$Value,
            [string]$Color = "Cyan"
        )
        if ($UseColors) {
            $PaddedLabel = $Label.PadRight(17)
            Write-Host "  $PaddedLabel " -ForegroundColor $Color -NoNewline
            Write-Host $Value
        } else {
            $PaddedLabel = $Label.PadRight(17)
            Write-Host "  $PaddedLabel $Value"
        }
    }

    # Title
    if ($UseColors) {
        Write-Host "CCS (Claude Code Switch) v$CcsVersion" -ForegroundColor White
    } else {
        Write-Host "CCS (Claude Code Switch) v$CcsVersion"
    }
    Write-Host ""

    # Installation section with table-like formatting
    if ($UseColors) { Write-Host "Installation:" -ForegroundColor Cyan }
    else { Write-Host "Installation:" }

    # Location - prioritize script location over command location
    $ScriptLocation = $MyInvocation.MyCommand.Path
    $InstallLocation = (Get-Command ccs -ErrorAction SilentlyContinue).Source

    # Show script location if running from source
    if ($ScriptLocation -and (Test-Path $ScriptLocation)) {
        Write-TableLine "Location:" $ScriptLocation
    } elseif ($InstallLocation) {
        Write-TableLine "Location:" $InstallLocation
    } else {
        Write-TableLine "Location:" "(not found - run from current directory)"
    }

    # .ccs/ directory location
    Write-TableLine "CCS Directory:" "$env:USERPROFILE\.ccs\"

    # Config path
    Write-TableLine "Config:" $ConfigFile

    # Profiles.json location
    Write-TableLine "Profiles:" $ProfilesJson

    # Delegation status - check multiple indicators
    $DelegationConfigured = $false
    $ReadyProfiles = @()

    # Check for delegation-sessions.json (primary indicator)
    $DelegationSessions = "$env:USERPROFILE\.ccs\delegation-sessions.json"
    if (Test-Path $DelegationSessions) {
        $DelegationConfigured = $true
    }

    # Check for profiles with valid API keys (secondary indicator)
    foreach ($profile in @("glm", "kimi")) {
        $SettingsFile = "$env:USERPROFILE\.ccs\$profile.settings.json"
        if (Test-Path $SettingsFile) {
            try {
                $Settings = Get-Content $SettingsFile -Raw | ConvertFrom-Json
                $ApiKey = $Settings.env.ANTHROPIC_AUTH_TOKEN
                if ($ApiKey -and $ApiKey -notmatch "YOUR_.*_API_KEY_HERE" -and $ApiKey -notmatch "sk-test.*") {
                    $ReadyProfiles += $profile
                    $DelegationConfigured = $true
                }
            } catch { }
        }
    }

    if ($DelegationConfigured) {
        Write-TableLine "Delegation:" "Enabled"
    } else {
        Write-TableLine "Delegation:" "Not configured"
    }

    Write-Host ""

    # Ready Profiles section - make it more prominent
    if ($ReadyProfiles.Count -gt 0) {
        if ($UseColors) { Write-Host "Delegation Ready:" -ForegroundColor Cyan }
        else { Write-Host "Delegation Ready:" }

        $ReadyProfilesStr = $ReadyProfiles -join ", "
        if ($UseColors) {
            Write-Host "  ✓ " -ForegroundColor Yellow -NoNewline
            Write-Host "$ReadyProfilesStr profiles are ready for delegation"
        } else {
            Write-Host "  ! $ReadyProfilesStr profiles are ready for delegation"
        }
        Write-Host ""
    } elseif ($DelegationConfigured) {
        if ($UseColors) { Write-Host "Delegation Ready:" -ForegroundColor Cyan }
        else { Write-Host "Delegation Ready:" }

        if ($UseColors) {
            Write-Host "  ! " -ForegroundColor Yellow -NoNewline
            Write-Host "Delegation configured but no valid API keys found"
        } else {
            Write-Host "  ! Delegation configured but no valid API keys found"
        }
        Write-Host ""
    }

    # Documentation
    if ($UseColors) {
        Write-Host "Documentation: https://github.com/kaitranntt/ccs" -ForegroundColor Cyan
        Write-Host "License: MIT" -ForegroundColor Cyan
    } else {
        Write-Host "Documentation: https://github.com/kaitranntt/ccs"
        Write-Host "License: MIT"
    }
    Write-Host ""

    if ($UseColors) {
        Write-Host "Run 'ccs --help' for usage information" -ForegroundColor Yellow
    } else {
        Write-Host "Run 'ccs --help' for usage information"
    }
}

# --- Auto-Recovery Functions ---

function Ensure-CcsDirectory {
    if (Test-Path "$env:USERPROFILE\.ccs") { return $true }

    try {
        New-Item -ItemType Directory -Path "$env:USERPROFILE\.ccs" -Force | Out-Null
        Write-Host "[i] Auto-recovery: Created ~/.ccs/ directory"
        return $true
    } catch {
        Write-ErrorMsg "Cannot create ~/.ccs/ directory. Check permissions."
        return $false
    }
}

function Ensure-ConfigJson {
    $ConfigFile = "$env:USERPROFILE\.ccs\config.json"

    # Check if exists and valid
    if (Test-Path $ConfigFile) {
        try {
            Get-Content $ConfigFile -Raw | ConvertFrom-Json | Out-Null
            return $true
        } catch {
            # Corrupted - backup and recreate
            $BackupFile = "$ConfigFile.backup.$(Get-Date -Format 'yyyyMMddHHmmss')"
            Move-Item $ConfigFile $BackupFile -Force
            Write-Host "[i] Auto-recovery: Backed up corrupted config.json"
        }
    }

    # Create default config
    $DefaultConfig = @{
        profiles = @{
            glm = "~/.ccs/glm.settings.json"
            kimi = "~/.ccs/kimi.settings.json"
            default = "~/.claude/settings.json"
        }
    }

    $DefaultConfig | ConvertTo-Json -Depth 10 | Set-Content $ConfigFile
    Write-Host "[i] Auto-recovery: Created ~/.ccs/config.json"
    return $true
}

function Ensure-ClaudeSettings {
    $ClaudeDir = "$env:USERPROFILE\.claude"
    $SettingsFile = "$ClaudeDir\settings.json"

    # Create ~/.claude/ if missing
    if (-not (Test-Path $ClaudeDir)) {
        New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null
        Write-Host "[i] Auto-recovery: Created ~/.claude/ directory"
    }

    # Create settings.json if missing
    if (-not (Test-Path $SettingsFile)) {
        '{}' | Set-Content $SettingsFile
        Write-Host "[i] Auto-recovery: Created ~/.claude/settings.json"
        Write-Host "[i] Next step: Run 'claude /login' to authenticate"
        return $true
    }

    return $false
}

function Invoke-AutoRecovery {
    if (-not (Ensure-CcsDirectory)) { return $false }
    if (-not (Ensure-ConfigJson)) { return $false }
    Ensure-ClaudeSettings | Out-Null
    return $true
}

# --- Profile Registry Functions (Phase 4) ---

function Initialize-ProfilesJson {
    if (Test-Path $ProfilesJson) { return }

    $InitData = @{
        version = "2.0.0"
        profiles = @{}
        default = $null
    }

    $InitData | ConvertTo-Json -Depth 10 | Set-Content $ProfilesJson

    # Set file permissions (user-only)
    $Acl = Get-Acl $ProfilesJson
    $Acl.SetAccessRuleProtection($true, $false)
    $Acl.Access | ForEach-Object { $Acl.RemoveAccessRule($_) | Out-Null }
    $CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $CurrentUser, "FullControl", "Allow"
    )
    $Acl.AddAccessRule($Rule)
    Set-Acl -Path $ProfilesJson -AclObject $Acl
}

function Read-ProfilesJson {
    Initialize-ProfilesJson
    Get-Content $ProfilesJson -Raw | ConvertFrom-Json
}

function Write-ProfilesJson {
    param([PSCustomObject]$Data)

    $TempFile = "$ProfilesJson.tmp"

    try {
        $Data | ConvertTo-Json -Depth 10 | Set-Content $TempFile
        Move-Item $TempFile $ProfilesJson -Force
    } catch {
        if (Test-Path $TempFile) { Remove-Item $TempFile -Force }
        throw "Failed to write profiles registry: $_"
    }
}

function Test-ProfileExists {
    param([string]$ProfileName)

    Initialize-ProfilesJson
    $Data = Read-ProfilesJson
    return $Data.profiles.PSObject.Properties.Name -contains $ProfileName
}

function Register-Profile {
    param([string]$ProfileName)

    if (Test-ProfileExists $ProfileName) {
        throw "Profile already exists: $ProfileName"
    }

    $Data = Read-ProfilesJson
    $Timestamp = (Get-Date).ToUniversalTime().ToString("o")

    $Data.profiles | Add-Member -NotePropertyName $ProfileName -NotePropertyValue ([PSCustomObject]@{
        type = "account"
        created = $Timestamp
        last_used = $null
    })

    # Note: No longer auto-set as default
    # Users must explicitly run: ccs auth default <profile>
    # Default always stays on implicit 'default' profile (uses ~/.claude/)

    Write-ProfilesJson $Data
}

function Unregister-Profile {
    param([string]$ProfileName)

    if (-not (Test-ProfileExists $ProfileName)) { return }  # Idempotent

    $Data = Read-ProfilesJson

    # Remove profile
    $Data.profiles.PSObject.Properties.Remove($ProfileName)

    # Update default if it was the deleted profile
    if ($Data.default -eq $ProfileName) {
        $Remaining = $Data.profiles.PSObject.Properties.Name
        $Data.default = if ($Remaining.Count -gt 0) { $Remaining[0] } else { $null }
    }

    Write-ProfilesJson $Data
}

function Update-ProfileTimestamp {
    param([string]$ProfileName)

    if (-not (Test-ProfileExists $ProfileName)) { return }  # Silent fail

    $Data = Read-ProfilesJson
    $Timestamp = (Get-Date).ToUniversalTime().ToString("o")

    $Data.profiles.$ProfileName.last_used = $Timestamp

    Write-ProfilesJson $Data
}

function Get-DefaultProfile {
    Initialize-ProfilesJson
    $Data = Read-ProfilesJson
    return $Data.default
}

function Set-DefaultProfile {
    param([string]$ProfileName)

    if (-not (Test-ProfileExists $ProfileName)) {
        throw "Profile not found: $ProfileName"
    }

    $Data = Read-ProfilesJson
    $Data.default = $ProfileName

    Write-ProfilesJson $Data
}

# --- Instance Management Functions (Phase 2) ---

function Get-SanitizedProfileName {
    param([string]$Name)

    # Replace unsafe chars, lowercase
    return $Name.ToLower() -replace '[^a-z0-9_-]', '-'
}

function Set-InstancePermissions {
    param([string]$Path)

    # Get current user
    $CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

    # Create new ACL with inheritance disabled
    $Acl = Get-Acl $Path
    $Acl.SetAccessRuleProtection($true, $false)  # Disable inheritance
    $Acl.Access | ForEach-Object { $Acl.RemoveAccessRule($_) | Out-Null }

    # Grant full control to current user only
    $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $CurrentUser, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow"
    )
    $Acl.AddAccessRule($Rule)

    Set-Acl -Path $Path -AclObject $Acl
}

function Link-SharedDirectories {
    param([string]$InstancePath)

    $SharedDir = "$env:USERPROFILE\.ccs\shared"

    # Ensure shared directories exist
    @('commands', 'skills', 'agents') | ForEach-Object {
        $Dir = Join-Path $SharedDir $_
        if (-not (Test-Path $Dir)) {
            New-Item -ItemType Directory -Path $Dir -Force | Out-Null
        }
    }

    # Create symlinks (requires Windows Developer Mode or admin)
    @('commands', 'skills', 'agents') | ForEach-Object {
        $LinkPath = Join-Path $InstancePath $_
        $TargetPath = Join-Path $SharedDir $_

        # Remove existing directory/link
        if (Test-Path $LinkPath) {
            Remove-Item $LinkPath -Recurse -Force
        }

        # Try creating symlink (requires privileges)
        try {
            New-Item -ItemType SymbolicLink -Path $LinkPath -Target $TargetPath -Force | Out-Null
        } catch {
            # Fallback: Copy directory instead (suboptimal but functional)
            Copy-Item $TargetPath -Destination $LinkPath -Recurse -Force
            Write-Host "[!] Symlink failed for $_, copied instead (enable Developer Mode)" -ForegroundColor Yellow
        }
    }
}

function Migrate-SharedStructure {
    $SharedDir = "$env:USERPROFILE\.ccs\shared"

    # Check if migration is needed (shared dirs exist but are empty)
    if (Test-Path $SharedDir) {
        $NeedsMigration = $false
        foreach ($Dir in @('commands', 'skills', 'agents')) {
            $DirPath = Join-Path $SharedDir $Dir
            if (-not (Test-Path $DirPath) -or (Get-ChildItem $DirPath -ErrorAction SilentlyContinue).Count -eq 0) {
                $NeedsMigration = $true
                break
            }
        }

        if (-not $NeedsMigration) { return }
    }

    # Create shared directory
    @('commands', 'skills', 'agents') | ForEach-Object {
        $Dir = Join-Path $SharedDir $_
        New-Item -ItemType Directory -Path $Dir -Force | Out-Null
    }

    # Copy from ~/.claude/ (actual Claude CLI directory)
    $ClaudeDir = "$env:USERPROFILE\.claude"

    if (Test-Path $ClaudeDir) {
        # Copy commands to shared (if exists)
        $CommandsPath = Join-Path $ClaudeDir "commands"
        if (Test-Path $CommandsPath) {
            Copy-Item "$CommandsPath\*" -Destination "$SharedDir\commands\" -Recurse -ErrorAction SilentlyContinue
        }

        # Copy skills to shared (if exists)
        $SkillsPath = Join-Path $ClaudeDir "skills"
        if (Test-Path $SkillsPath) {
            Copy-Item "$SkillsPath\*" -Destination "$SharedDir\skills\" -Recurse -ErrorAction SilentlyContinue
        }

        # Copy agents to shared (if exists)
        $AgentsPath = Join-Path $ClaudeDir "agents"
        if (Test-Path $AgentsPath) {
            Copy-Item "$AgentsPath\*" -Destination "$SharedDir\agents\" -Recurse -ErrorAction SilentlyContinue
        }
    }

    # Update all instances to use symlinks
    if (Test-Path $InstancesDir) {
        Get-ChildItem $InstancesDir -Directory | ForEach-Object {
            Link-SharedDirectories $_.FullName
        }
    }

    Write-Host "[OK] Migrated to shared structure"
}

function Copy-GlobalConfigs {
    param([string]$InstancePath)

    $GlobalClaude = "$env:USERPROFILE\.claude"

    # Copy settings.json only (commands/skills are now symlinked to shared/)
    $GlobalSettings = Join-Path $GlobalClaude "settings.json"
    if (Test-Path $GlobalSettings) {
        Copy-Item $GlobalSettings -Destination (Join-Path $InstancePath "settings.json") -ErrorAction SilentlyContinue
    }
}

function Initialize-Instance {
    param([string]$InstancePath)

    # Create base directory with user-only ACL
    New-Item -ItemType Directory -Path $InstancePath -Force | Out-Null
    Set-InstancePermissions $InstancePath

    # Create subdirectories (profile-specific only)
    $Subdirs = @('session-env', 'todos', 'logs', 'file-history',
                  'shell-snapshots', 'debug', '.anthropic')

    foreach ($Dir in $Subdirs) {
        $DirPath = Join-Path $InstancePath $Dir
        New-Item -ItemType Directory -Path $DirPath -Force | Out-Null
    }

    # Symlink shared directories
    Link-SharedDirectories $InstancePath

    # Copy global configs
    Copy-GlobalConfigs $InstancePath
}

function Validate-Instance {
    param([string]$InstancePath)

    $RequiredDirs = @('session-env', 'todos', 'logs', 'file-history',
                      'shell-snapshots', 'debug', '.anthropic')

    foreach ($Dir in $RequiredDirs) {
        $DirPath = Join-Path $InstancePath $Dir
        if (-not (Test-Path $DirPath)) {
            New-Item -ItemType Directory -Path $DirPath -Force | Out-Null
        }
    }
}

function Ensure-Instance {
    param([string]$ProfileName)

    $SafeName = Get-SanitizedProfileName $ProfileName
    $InstancePath = "$InstancesDir\$SafeName"

    if (-not (Test-Path $InstancePath)) {
        Initialize-Instance $InstancePath
    }

    Validate-Instance $InstancePath

    return $InstancePath
}

# --- Profile Detection Logic (Phase 1) ---

function Get-AllProfileNames {
    $names = @()

    # Settings-based profiles
    if (Test-Path $ConfigFile) {
        try {
            $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            $names += $Config.profiles.PSObject.Properties.Name
        } catch {}
    }

    # Account-based profiles
    if (Test-Path $ProfilesJson) {
        try {
            $Profiles = Read-ProfilesJson
            $names += $Profiles.profiles.PSObject.Properties.Name
        } catch {}
    }

    return $names
}

function Get-AvailableProfiles {
    $lines = @()

    # Settings-based profiles
    if (Test-Path $ConfigFile) {
        try {
            $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            $SettingsProfiles = $Config.profiles.PSObject.Properties.Name

            if ($SettingsProfiles.Count -gt 0) {
                $lines += "Settings-based profiles (GLM, Kimi, etc.):"
                foreach ($name in $SettingsProfiles) {
                    $lines += "  - $name"
                }
            }
        } catch {}
    }

    # Account-based profiles
    if (Test-Path $ProfilesJson) {
        try {
            $Profiles = Read-ProfilesJson
            $AccountProfiles = $Profiles.profiles.PSObject.Properties.Name

            if ($AccountProfiles.Count -gt 0) {
                $lines += "Account-based profiles:"
                foreach ($name in $AccountProfiles) {
                    $IsDefault = if ($name -eq $Profiles.default) { " [DEFAULT]" } else { "" }
                    $lines += "  - $name$IsDefault"
                }
            }
        } catch {}
    }

    if ($lines.Count -eq 0) {
        return "  (no profiles configured)`n  Run `"ccs auth create <profile>`" to create your first account profile."
    } else {
        return $lines -join "`n"
    }
}

function Get-ProfileType {
    param([string]$ProfileName)

    # Special case: 'default' resolves to default profile
    if ($ProfileName -eq "default") {
        # Check account-based default first
        if (Test-Path $ProfilesJson) {
            $Profiles = Read-ProfilesJson
            $DefaultAccount = $Profiles.default

            if ($DefaultAccount -and (Test-ProfileExists $DefaultAccount)) {
                return @{
                    Type = "account"
                    Name = $DefaultAccount
                }
            }
        }

        # Check settings-based default
        if (Test-Path $ConfigFile) {
            $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            $DefaultSettings = $Config.profiles.default

            if ($DefaultSettings) {
                return @{
                    Type = "settings"
                    Path = $DefaultSettings
                    Name = "default"
                }
            }
        }

        # No default configured, use Claude's defaults
        return @{
            Type = "default"
            Name = "default"
        }
    }

    # Priority 1: Check settings-based profiles (backward compatibility)
    if (Test-Path $ConfigFile) {
        try {
            $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            $SettingsPath = $Config.profiles.$ProfileName

            if ($SettingsPath) {
                return @{
                    Type = "settings"
                    Path = $SettingsPath
                    Name = $ProfileName
                }
            }
        } catch {}
    }

    # Priority 2: Check account-based profiles
    if ((Test-Path $ProfilesJson) -and (Test-ProfileExists $ProfileName)) {
        return @{
            Type = "account"
            Name = $ProfileName
        }
    }

    # Not found
    return @{
        Type = "error"
    }
}

# --- Sync Command ---

function Sync-Run {
    $CcsClaudeDir = "$env:USERPROFILE\.ccs\.claude"
    $UserClaudeDir = "$env:USERPROFILE\.claude"

    Write-Host "Syncing delegation commands and skills to ~/.claude/..." -ForegroundColor Cyan
    Write-Host ""

    # Check if source directory exists
    if (-not (Test-Path $CcsClaudeDir)) {
        Write-Host "[X] CCS .claude/ directory not found at $CcsClaudeDir" -ForegroundColor Red
        Write-Host "Reinstall CCS: npm install -g @kaitranntt/ccs --force"
        exit 1
    }

    # Create ~/.claude/ if missing
    if (-not (Test-Path $UserClaudeDir)) {
        Write-Host "[i] Creating ~/.claude/ directory" -ForegroundColor Cyan
        New-Item -ItemType Directory -Path $UserClaudeDir -Force | Out-Null
    }

    # Items to symlink
    $Items = @(
        @{ Source = "commands\ccs"; Target = "commands\ccs"; Type = "Directory" }
        @{ Source = "skills\ccs-delegation"; Target = "skills\ccs-delegation"; Type = "Directory" }
        @{ Source = "agents\ccs-delegator.md"; Target = "agents\ccs-delegator.md"; Type = "File" }
    )

    $Installed = 0
    $Skipped = 0

    foreach ($Item in $Items) {
        $SourcePath = Join-Path $CcsClaudeDir $Item.Source
        $TargetPath = Join-Path $UserClaudeDir $Item.Target
        $TargetDir = Split-Path -Parent $TargetPath

        # Check source exists
        if (-not (Test-Path $SourcePath)) {
            Write-Host "[!] Source not found: $($Item.Source), skipping" -ForegroundColor Yellow
            continue
        }

        # Create parent directory if needed
        if (-not (Test-Path $TargetDir)) {
            New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
        }

        # Check if already correct symlink
        if (Test-Path $TargetPath) {
            $ItemInfo = Get-Item $TargetPath -Force
            if ($ItemInfo.LinkType -eq "SymbolicLink") {
                $LinkTarget = $ItemInfo.Target
                if ($LinkTarget -eq $SourcePath) {
                    $Skipped++
                    continue
                }
            }

            # Backup existing file/directory
            $Timestamp = Get-Date -Format "yyyy-MM-dd"
            $BackupPath = "$TargetPath.backup-$Timestamp"
            $Counter = 1

            while (Test-Path $BackupPath) {
                $BackupPath = "$TargetPath.backup-$Timestamp-$Counter"
                $Counter++
            }

            Move-Item -Path $TargetPath -Destination $BackupPath -Force
            Write-Host "[i] Backed up existing to $(Split-Path -Leaf $BackupPath)" -ForegroundColor Cyan
        }

        # Create symlink
        try {
            $SymlinkType = if ($Item.Type -eq "Directory") { "Junction" } else { "SymbolicLink" }
            New-Item -ItemType $SymlinkType -Path $TargetPath -Target $SourcePath -Force -ErrorAction Stop | Out-Null
            Write-Host "[OK] Installed $($Item.Target)" -ForegroundColor Green
            $Installed++
        } catch {
            Write-Host "[X] Failed to install $($Item.Target): $($_.Exception.Message)" -ForegroundColor Red
            if ($_.Exception.Message -match "privilege") {
                Write-Host "[i] Run PowerShell as Administrator or enable Developer Mode" -ForegroundColor Yellow
            }
        }
    }

    Write-Host ""
    Write-Host "✓ Update complete" -ForegroundColor Green
    Write-Host "  Installed: $Installed"
    Write-Host "  Already up-to-date: $Skipped"
    Write-Host ""
}

# --- Update Command ---

function Update-Run {
    Write-Host ""
    Write-Host "Checking for updates..." -ForegroundColor Cyan
    Write-Host ""

    # Detect installation method
    $InstallMethod = "direct"
    try {
        $NpmList = npm list -g @kaitranntt/ccs 2>&1
        if ($LASTEXITCODE -eq 0) {
            $InstallMethod = "npm"
        }
    } catch {
        # npm not available or not installed via npm
    }

    # Fetch latest version from appropriate source
    $LatestVersion = ""
    try {
        if ($InstallMethod -eq "npm") {
            # Check npm registry for npm installations
            $Response = Invoke-RestMethod -Uri "https://registry.npmjs.org/@kaitranntt/ccs/latest" -TimeoutSec 5
            $LatestVersion = $Response.version
        } else {
            # Check GitHub releases for direct installations
            $Response = Invoke-RestMethod -Uri "https://api.github.com/repos/kaitranntt/ccs/releases/latest" -TimeoutSec 5
            $LatestVersion = $Response.tag_name -replace '^v', ''
        }
    } catch {
        Write-Host "[!] Unable to check for updates" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Try manually:"
        if ($InstallMethod -eq "npm") {
            Write-Host "  npm install -g @kaitranntt/ccs@latest" -ForegroundColor Yellow
        } else {
            Write-Host "  irm ccs.kaitran.ca/install | iex" -ForegroundColor Yellow
        }
        Write-Host ""
        exit 1
    }

    # Compare versions
    if ($LatestVersion -eq $CcsVersion) {
        Write-Host "[OK] You are already on the latest version ($CcsVersion)" -ForegroundColor Green
        Write-Host ""
        exit 0
    }

    # Check if update available
    $CurrentParts = $CcsVersion.Split('.')
    $LatestParts = $LatestVersion.Split('.')

    $IsNewer = $false
    for ($i = 0; $i -lt 3; $i++) {
        $Current = [int]$CurrentParts[$i]
        $Latest = [int]$LatestParts[$i]

        if ($Latest -gt $Current) {
            $IsNewer = $true
            break
        } elseif ($Latest -lt $Current) {
            break
        }
    }

    if (-not $IsNewer) {
        Write-Host "[OK] You are on version $CcsVersion (latest is $LatestVersion)" -ForegroundColor Green
        Write-Host ""
        exit 0
    }

    Write-Host "[i] Update available: $CcsVersion → $LatestVersion" -ForegroundColor Yellow
    Write-Host ""

    # Perform update based on installation method
    if ($InstallMethod -eq "npm") {
        Write-Host "Updating via npm..." -ForegroundColor Cyan
        Write-Host ""

        try {
            npm install -g @kaitranntt/ccs@latest
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "[OK] Update successful!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Run ccs --version to verify" -ForegroundColor Yellow
                Write-Host ""
                exit 0
            } else {
                throw "npm install failed"
            }
        } catch {
            Write-Host ""
            Write-Host "[X] Update failed" -ForegroundColor Red
            Write-Host ""
            Write-Host "Try manually:"
            Write-Host "  npm install -g @kaitranntt/ccs@latest" -ForegroundColor Yellow
            Write-Host ""
            exit 1
        }
    } else {
        Write-Host "Updating via installer..." -ForegroundColor Cyan
        Write-Host ""

        try {
            irm ccs.kaitran.ca/install | iex
            Write-Host ""
            Write-Host "[OK] Update successful!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Run ccs --version to verify" -ForegroundColor Yellow
            Write-Host ""
            exit 0
        } catch {
            Write-Host ""
            Write-Host "[X] Update failed" -ForegroundColor Red
            Write-Host ""
            Write-Host "Try manually:"
            Write-Host "  irm ccs.kaitran.ca/install | iex" -ForegroundColor Yellow
            Write-Host ""
            exit 1
        }
    }
}

# --- Auth Commands (Phase 3) ---

function Show-AuthHelp {
    Write-Host ""
    Write-Host "CCS Concurrent Account Management" -ForegroundColor White
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  ccs auth <command> [options]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor Cyan
    Write-Host "  create <profile>        Create new profile and login" -ForegroundColor Yellow
    Write-Host "  list                   List all saved profiles" -ForegroundColor Yellow
    Write-Host "  show <profile>         Show profile details" -ForegroundColor Yellow
    Write-Host "  remove <profile>       Remove saved profile" -ForegroundColor Yellow
    Write-Host "  default <profile>      Set default profile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor Cyan
    Write-Host "  ccs auth create work                     # Create & login to work profile" -ForegroundColor Yellow
    Write-Host "  ccs auth default work                    # Set work as default" -ForegroundColor Yellow
    Write-Host "  ccs auth list                            # List all profiles" -ForegroundColor Yellow
    Write-Host '  ccs work "review code"                   # Use work profile' -ForegroundColor Yellow
    Write-Host '  ccs "review code"                        # Use default profile' -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  --force                   Allow overwriting existing profile (create)" -ForegroundColor Yellow
    Write-Host "  --yes, -y                 Skip confirmation prompts (remove)" -ForegroundColor Yellow
    Write-Host "  --json                    Output in JSON format (list, show)" -ForegroundColor Yellow
    Write-Host "  --verbose                 Show additional details (list)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Note:" -ForegroundColor Cyan
    Write-Host "  By default, " -NoNewline
    Write-Host "ccs" -ForegroundColor Yellow -NoNewline
    Write-Host " uses Claude CLI defaults from ~/.claude/"
    Write-Host "  Use " -NoNewline
    Write-Host "ccs auth default <profile>" -ForegroundColor Yellow -NoNewline
    Write-Host " to change the default profile."
    Write-Host ""
}

function Invoke-AuthCreate {
    param([string[]]$Args)

    $ProfileName = ""
    $Force = $false

    foreach ($arg in $Args) {
        if ($arg -eq "--force") {
            $Force = $true
        } elseif ($arg -match '^-') {
            Write-ErrorMsg "Unknown option: $arg"
            return 1
        } else {
            $ProfileName = $arg
        }
    }

    if (-not $ProfileName) {
        Write-ErrorMsg "Profile name is required`n`nUsage: ccs auth create <profile> [--force]"
        return 1
    }

    if (-not $Force -and (Test-ProfileExists $ProfileName)) {
        Write-ErrorMsg "Profile already exists: $ProfileName`nUse --force to overwrite"
        return 1
    }

    # Create instance
    Write-Host "[i] Creating profile: $ProfileName"
    $InstancePath = Ensure-Instance $ProfileName
    Write-Host "[i] Instance directory: $InstancePath"
    Write-Host ""

    # Register profile
    Register-Profile $ProfileName

    # Launch Claude for login
    Write-Host "[i] Starting Claude in isolated instance..." -ForegroundColor Yellow
    Write-Host "[i] You will be prompted to login with your account." -ForegroundColor Yellow
    Write-Host ""

    $env:CLAUDE_CONFIG_DIR = $InstancePath
    $ClaudeCli = Find-ClaudeCli
    & $ClaudeCli

    if ($LASTEXITCODE -ne 0) {
        Write-ErrorMsg "Login failed or cancelled`nTo retry: ccs auth create $ProfileName --force"
        return 1
    }

    Write-Host ""
    Write-Host "[OK] Profile created successfully" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Profile: $ProfileName"
    Write-Host "  Instance: $InstancePath"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "  ccs $ProfileName `"your prompt here`"        # Use this specific profile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host 'To set as default (so you can use just "ccs"):'
    Write-Host "  ccs auth default $ProfileName" -ForegroundColor Yellow
    Write-Host ""
}

function Invoke-AuthList {
    param([string[]]$Args)

    $Verbose = $Args -contains "--verbose"
    $Json = $Args -contains "--json"

    if (-not (Test-Path $ProfilesJson)) {
        if ($Json) {
            Write-Output "{`"version`":`"$CcsVersion`",`"profiles`":[]}"
            return
        }
        Write-Host "No account profiles found" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To create your first profile:"
        Write-Host "  ccs auth create <profile>" -ForegroundColor Yellow
        return
    }

    $Data = Read-ProfilesJson
    $Profiles = $Data.profiles.PSObject.Properties.Name

    if ($Profiles.Count -eq 0) {
        if ($Json) {
            Write-Output "{`"version`":`"$CcsVersion`",`"profiles`":[]}"
            return
        }
        Write-Host "No account profiles found" -ForegroundColor Yellow
        return
    }

    # JSON output mode
    if ($Json) {
        $ProfilesList = @()
        foreach ($profile in $Profiles) {
            $IsDefault = $profile -eq $Data.default
            $Type = $Data.profiles.$profile.type
            if (-not $Type) { $Type = "account" }
            $Created = $Data.profiles.$profile.created
            $LastUsed = $Data.profiles.$profile.last_used
            $InstancePath = "$InstancesDir\$(Get-SanitizedProfileName $profile)"

            $ProfilesList += @{
                name = $profile
                type = $Type
                is_default = $IsDefault
                created = $Created
                last_used = $LastUsed
                instance_path = $InstancePath
            }
        }

        $Output = @{
            version = $CcsVersion
            profiles = $ProfilesList
        }

        Write-Output ($Output | ConvertTo-Json -Depth 10)
        return
    }

    # Human-readable output
    Write-Host "Saved Account Profiles:" -ForegroundColor White
    Write-Host ""

    foreach ($profile in $Profiles) {
        $IsDefault = $profile -eq $Data.default

        if ($IsDefault) {
            Write-Host "[*] " -ForegroundColor Green -NoNewline
            Write-Host $profile -ForegroundColor Cyan -NoNewline
            Write-Host " (default)" -ForegroundColor Green
        } else {
            Write-Host "[ ] " -NoNewline
            Write-Host $profile -ForegroundColor Cyan
        }

        $Type = $Data.profiles.$profile.type
        Write-Host "    Type: $Type"

        if ($Verbose) {
            $Created = $Data.profiles.$profile.created
            $LastUsed = $Data.profiles.$profile.last_used
            if (-not $LastUsed) { $LastUsed = "Never" }
            Write-Host "    Created: $Created"
            Write-Host "    Last used: $LastUsed"
        }

        Write-Host ""
    }
}

function Invoke-AuthShow {
    param([string[]]$Args)

    $ProfileName = ""
    $Json = $false

    # Parse arguments
    foreach ($arg in $Args) {
        if ($arg -eq "--json") {
            $Json = $true
        } elseif ($arg -like "-*") {
            Write-ErrorMsg "Unknown option: $arg"
            return 1
        } else {
            $ProfileName = $arg
        }
    }

    if (-not $ProfileName) {
        Write-ErrorMsg "Profile name is required"
        Write-Host ""
        Write-Host "Usage: " -NoNewline
        Write-Host "ccs auth show <profile> [--json]" -ForegroundColor Yellow
        return 1
    }

    if (-not (Test-ProfileExists $ProfileName)) {
        Write-ErrorMsg "Profile not found: $ProfileName"
        return 1
    }

    $Data = Read-ProfilesJson
    $IsDefault = $ProfileName -eq $Data.default

    $Type = $Data.profiles.$ProfileName.type
    if (-not $Type) { $Type = "account" }
    $Created = $Data.profiles.$ProfileName.created
    $LastUsed = $Data.profiles.$ProfileName.last_used
    $InstancePath = "$InstancesDir\$(Get-SanitizedProfileName $ProfileName)"

    # Count sessions
    $SessionCount = 0
    if (Test-Path "$InstancePath\session-env") {
        $SessionFiles = Get-ChildItem "$InstancePath\session-env" -Filter "*.json" -ErrorAction SilentlyContinue
        $SessionCount = $SessionFiles.Count
    }

    # JSON output mode
    if ($Json) {
        $Output = @{
            name = $ProfileName
            type = $Type
            is_default = $IsDefault
            created = $Created
            last_used = $LastUsed
            instance_path = $InstancePath
            session_count = $SessionCount
        }

        Write-Output ($Output | ConvertTo-Json -Depth 10)
        return
    }

    # Human-readable output
    Write-Host "Profile: $ProfileName" -ForegroundColor White
    Write-Host ""

    Write-Host "  Type: $Type"
    Write-Host "  Default: $(if ($IsDefault) { 'Yes' } else { 'No' })"
    Write-Host "  Instance: $InstancePath"
    Write-Host "  Created: $Created"
    if ($LastUsed) {
        Write-Host "  Last used: $LastUsed"
    } else {
        Write-Host "  Last used: Never"
    }
    Write-Host ""
}

function Invoke-AuthRemove {
    param([string[]]$Args)

    $ProfileName = ""

    # Parse arguments
    foreach ($arg in $Args) {
        if ($arg -eq "--yes" -or $arg -eq "-y") {
            $env:CCS_YES = "1"  # Auto-confirm
        } elseif ($arg -like "-*") {
            Write-ErrorMsg "Unknown option: $arg"
            return 1
        } else {
            $ProfileName = $arg
        }
    }

    if (-not $ProfileName) {
        Write-ErrorMsg "Profile name is required"
        Write-Host ""
        Write-Host "Usage: " -NoNewline
        Write-Host "ccs auth remove <profile> [--yes]" -ForegroundColor Yellow
        return 1
    }

    if (-not (Test-ProfileExists $ProfileName)) {
        Write-ErrorMsg "Profile not found: $ProfileName"
        return 1
    }

    # Get instance path and session count for impact display
    $InstancePath = "$InstancesDir\$(Get-SanitizedProfileName $ProfileName)"
    $SessionCount = 0

    if (Test-Path "$InstancePath\session-env") {
        $SessionFiles = Get-ChildItem "$InstancePath\session-env" -Filter "*.json" -ErrorAction SilentlyContinue
        $SessionCount = $SessionFiles.Count
    }

    # Display impact
    Write-Host ""
    Write-Host "Profile '" -NoNewline
    Write-Host $ProfileName -ForegroundColor Cyan -NoNewline
    Write-Host "' will be permanently deleted."
    Write-Host "  Instance path: $InstancePath"
    Write-Host "  Sessions: $SessionCount conversation$(if ($SessionCount -ne 1) { 's' } else { '' })"
    Write-Host ""

    # Interactive confirmation (or --yes flag)
    $Confirmed = Confirm-Action "Delete this profile?" "No"

    if (-not $Confirmed) {
        Write-Host "[i] Cancelled"
        return 0
    }

    # Delete instance directory
    if (Test-Path $InstancePath) {
        Remove-Item $InstancePath -Recurse -Force
    }

    # Remove from registry
    Unregister-Profile $ProfileName

    Write-Host "[OK] Profile removed successfully" -ForegroundColor Green
    Write-Host "    Profile: $ProfileName"
    Write-Host ""
}

function Invoke-AuthDefault {
    param([string[]]$Args)

    $ProfileName = $Args[0]

    if (-not $ProfileName) {
        Write-ErrorMsg "Profile name is required`nUsage: ccs auth default <profile>"
        return 1
    }

    if (-not (Test-ProfileExists $ProfileName)) {
        Write-ErrorMsg "Profile not found: $ProfileName"
        return 1
    }

    Set-DefaultProfile $ProfileName

    Write-Host "[OK] Default profile set" -ForegroundColor Green
    Write-Host "    Profile: $ProfileName"
    Write-Host ""
    Write-Host "Now you can use:"
    Write-Host "  ccs `"your prompt`"  # Uses $ProfileName profile" -ForegroundColor Yellow
    Write-Host ""
}

function Invoke-AuthCommands {
    param([string[]]$Args)

    $Subcommand = $Args[0]
    $SubArgs = if ($Args.Count -gt 1) { $Args[1..($Args.Count-1)] } else { @() }

    switch ($Subcommand) {
        "create" { Invoke-AuthCreate $SubArgs }
        "list" { Invoke-AuthList $SubArgs }
        "show" { Invoke-AuthShow $SubArgs }
        "remove" { Invoke-AuthRemove $SubArgs }
        "default" { Invoke-AuthDefault $SubArgs }
        default { Show-AuthHelp }
    }
}

function Install-ShellCompletion {
    param([string[]]$Args)

    Write-Host ""
    Write-Host "Shell Completion Installer" -ForegroundColor Yellow
    Write-Host ""

    # Ensure completion directory exists
    $CompletionsDir = Join-Path $env:USERPROFILE ".ccs\completions"
    if (-not (Test-Path $CompletionsDir)) {
        New-Item -ItemType Directory -Path $CompletionsDir -Force | Out-Null
    }

    # Ensure completion file exists
    $CompletionFile = Join-Path $CompletionsDir "ccs.ps1"
    if (-not (Test-Path $CompletionFile)) {
        Write-Host "[X] Completion file not found. Please reinstall CCS." -ForegroundColor Red
        Write-Host ""
        exit 1
    }

    # Get PowerShell profile path
    $ProfilePath = $PROFILE
    $ProfileDir = Split-Path $ProfilePath -Parent

    # Create profile directory if it doesn't exist
    if (-not (Test-Path $ProfileDir)) {
        New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    }

    # Comment marker for easy identification
    $Marker = "# CCS shell completion"
    $SourceCmd = ". `"$CompletionFile`""

    # Check if already installed
    if (Test-Path $ProfilePath) {
        $Content = Get-Content $ProfilePath -Raw -ErrorAction SilentlyContinue
        if ($Content -and $Content.Contains($Marker)) {
            Write-Host "[OK] Shell completion already installed" -ForegroundColor Green
            Write-Host ""
            return 0
        }
    }

    # Append to PowerShell profile
    $Block = "`n$Marker`n$SourceCmd`n"
    Add-Content -Path $ProfilePath -Value $Block -NoNewline

    Write-Host "[OK] Shell completion installed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Added to $ProfilePath"
    Write-Host ""
    Write-Host "To activate:" -ForegroundColor Cyan
    Write-Host "  . `$PROFILE"
    Write-Host ""

    return 0
}

# --- Main Execution Logic ---

# Special case: version command (check BEFORE profile detection)
if ($Version) {
    Show-Version
    exit 0
} elseif ($RemainingArgs.Count -gt 0) {
    $FirstArg = $RemainingArgs[0]
    if ($FirstArg -eq "version" -or $FirstArg -eq "--version" -or $FirstArg -eq "-v") {
        Show-Version
        exit 0
    }
}

# Special case: help command (check BEFORE profile detection)
if ($Help) {
    Show-Help
    exit 0
} elseif ($RemainingArgs.Count -gt 0) {
    $FirstArg = $RemainingArgs[0]
    if ($FirstArg -eq "--help" -or $FirstArg -eq "-h" -or $FirstArg -eq "help") {
        Show-Help
        exit 0
    }
}

# Special case: shell completion installer
if ($RemainingArgs.Count -gt 0 -and ($RemainingArgs[0] -eq "--shell-completion" -or $RemainingArgs[0] -eq "-sc")) {
    $CompletionArgs = if ($RemainingArgs.Count -gt 1) { $RemainingArgs[1..($RemainingArgs.Count-1)] } else { @() }
    $Result = Install-ShellCompletion $CompletionArgs
    exit $Result
}

# Special case: auth commands
if ($RemainingArgs.Count -gt 0 -and $RemainingArgs[0] -eq "auth") {
    $AuthArgs = if ($RemainingArgs.Count -gt 1) { $RemainingArgs[1..($RemainingArgs.Count-1)] } else { @() }
    Invoke-AuthCommands $AuthArgs
    exit $LASTEXITCODE
}

# Special case: sync command
if ($RemainingArgs.Count -gt 0 -and ($RemainingArgs[0] -eq "sync" -or $RemainingArgs[0] -eq "--sync")) {
    Sync-Run
    exit 0
}

# Special case: update command
if ($RemainingArgs.Count -gt 0 -and ($RemainingArgs[0] -eq "update" -or $RemainingArgs[0] -eq "--update")) {
    Update-Run
    exit 0
}

# Run auto-recovery before main logic
if (-not (Invoke-AutoRecovery)) {
    Write-ErrorMsg "Auto-recovery failed. Check permissions."
    exit 1
}

# Smart profile detection: if first arg starts with '-', it's a flag not a profile
if ($RemainingArgs.Count -eq 0 -or $RemainingArgs[0] -match '^-') {
    # No args or first arg is a flag → use default profile
    $Profile = "default"
    # $RemainingArgs already contains the remaining args correctly
} else {
    # First arg is a profile name
    $Profile = $RemainingArgs[0]
    $RemainingArgs = if ($RemainingArgs.Count -gt 1) { $RemainingArgs | Select-Object -Skip 1 } else { @() }
}

# Validate profile name (alphanumeric, dash, underscore only)
if ($Profile -notmatch '^[a-zA-Z0-9_-]+$') {
    $ErrorMessage = "Invalid profile name: $Profile" + "`n`n" +
    "Use only alphanumeric characters, dash, or underscore."

    Write-ErrorMsg $ErrorMessage
    exit 1
}

# Detect profile type
$ProfileInfo = Get-ProfileType $Profile

if ($ProfileInfo.Type -eq "error") {
    # Get suggestions using fuzzy matching
    $AllProfiles = Get-AllProfileNames
    $Suggestions = Find-SimilarStrings -Target $Profile -Candidates $AllProfiles

    Write-Host ""
    Write-Host "[X] Profile '$Profile' not found" -ForegroundColor Red
    Write-Host ""

    # Show suggestions if any
    if ($Suggestions -and $Suggestions.Count -gt 0) {
        Write-Host "Did you mean:" -ForegroundColor Yellow
        foreach ($suggestion in $Suggestions) {
            Write-Host "  $suggestion"
        }
        Write-Host ""
    }

    Write-Host "Available profiles:" -ForegroundColor Cyan
    Get-AvailableProfiles | ForEach-Object { Write-Host $_ }
    Write-Host ""
    Write-Host "Solutions:" -ForegroundColor Yellow
    Write-Host "  # Use existing profile"
    Write-Host "  ccs <profile> `"your prompt`""
    Write-Host ""
    Write-Host "  # Create new account profile"
    Write-Host "  ccs auth create <name>"
    Write-Host ""
    Write-Host "Error: $script:E_PROFILE_NOT_FOUND" -ForegroundColor Yellow
    Write-Host (Get-ErrorDocUrl $script:E_PROFILE_NOT_FOUND) -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Detect Claude CLI executable
$ClaudeCli = Find-ClaudeCli

# Execute based on profile type (Phase 5)
switch ($ProfileInfo.Type) {
    "account" {
        # Account-based profile: use CLAUDE_CONFIG_DIR
        $InstancePath = Ensure-Instance $ProfileInfo.Name
        Update-ProfileTimestamp $ProfileInfo.Name  # Update last_used

        # Execute Claude with isolated config
        $env:CLAUDE_CONFIG_DIR = $InstancePath

        try {
            if ($RemainingArgs) {
                & $ClaudeCli @RemainingArgs
            } else {
                & $ClaudeCli
            }
            exit $LASTEXITCODE
        } catch {
            Show-ClaudeNotFoundError
            exit 1
        }
    }

    "settings" {
        # Settings-based profile: use --settings flag
        $SettingsPath = $ProfileInfo.Path

        # Path expansion and normalization
        if ($SettingsPath -match '^~[/\\]') {
            $SettingsPath = $SettingsPath -replace '^~', $env:USERPROFILE
        }
        $SettingsPath = [System.Environment]::ExpandEnvironmentVariables($SettingsPath)
        $SettingsPath = $SettingsPath -replace '/', '\'

        if (-not (Test-Path $SettingsPath)) {
            Write-ErrorMsg "Settings file not found: $SettingsPath"
            exit 1
        }

        try {
            if ($RemainingArgs) {
                & $ClaudeCli --settings $SettingsPath @RemainingArgs
            } else {
                & $ClaudeCli --settings $SettingsPath
            }
            exit $LASTEXITCODE
        } catch {
            Show-ClaudeNotFoundError
            exit 1
        }
    }

    "default" {
        # Default: no special handling
        try {
            if ($RemainingArgs) {
                & $ClaudeCli @RemainingArgs
            } else {
                & $ClaudeCli
            }
            exit $LASTEXITCODE
        } catch {
            Show-ClaudeNotFoundError
            exit 1
        }
    }

    default {
        Write-ErrorMsg "Unknown profile type: $($ProfileInfo.Type)"
        exit 1
    }
}
