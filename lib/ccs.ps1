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
$CcsVersion = "3.0.0"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ConfigFile = if ($env:CCS_CONFIG) { $env:CCS_CONFIG } else { "$env:USERPROFILE\.ccs\config.json" }
$ProfilesJson = "$env:USERPROFILE\.ccs\profiles.json"
$InstancesDir = "$env:USERPROFILE\.ccs\instances"

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
    Write-ColorLine "  ccs auth <command> [options]" "Yellow"
    Write-ColorLine "  ccs [flags]" "Yellow"
    Write-Host ""
    Write-ColorLine "Description:" "Cyan"
    Write-Host "  Switch between Claude accounts and models instantly."
    Write-Host "  Supports concurrent multi-account sessions."
    Write-Host ""
    Write-ColorLine "Profile Switching:" "Cyan"
    Write-ColorLine "  ccs                         Use default profile" "Yellow"
    Write-ColorLine "  ccs glm                     Switch to GLM profile" "Yellow"
    Write-ColorLine "  ccs work                    Switch to work account" "Yellow"
    Write-ColorLine "  ccs work 'debug code'       Run command with work account" "Yellow"
    Write-Host ""
    Write-ColorLine "Account Management:" "Cyan"
    Write-ColorLine "  ccs auth create <profile>   Create new account profile" "Yellow"
    Write-ColorLine "  ccs auth list               List all profiles" "Yellow"
    Write-ColorLine "  ccs auth show <profile>     Show profile details" "Yellow"
    Write-ColorLine "  ccs auth remove <profile>   Remove profile (requires --force)" "Yellow"
    Write-ColorLine "  ccs auth default <profile>  Set default profile" "Yellow"
    Write-Host ""
    Write-ColorLine "Flags:" "Cyan"
    Write-ColorLine "  -h, --help                  Show this help message" "Yellow"
    Write-ColorLine "  -v, --version               Show version and installation info" "Yellow"
    Write-Host ""
    Write-ColorLine "Configuration:" "Cyan"
    Write-Host "  Config:   ~/.ccs/config.json"
    Write-Host "  Profiles: ~/.ccs/profiles.json"
    Write-Host "  Settings: ~/.ccs/*.settings.json"
    Write-Host ""
    Write-ColorLine "Examples:" "Cyan"
    Write-Host "  # Create work account profile"
    Write-ColorLine "  ccs auth create work" "Yellow"
    Write-Host ""
    Write-Host "  # Use work account"
    Write-ColorLine "  ccs work 'Review architecture'" "Yellow"
    Write-Host ""
    Write-Host "  # Switch to GLM for cost-effective tasks"
    Write-ColorLine "  ccs glm 'Write unit tests'" "Yellow"
    Write-Host ""
    Write-ColorLine "Documentation:" "Cyan"
    Write-Host "  GitHub:  https://github.com/kaitranntt/ccs"
    Write-Host "  Docs:    https://github.com/kaitranntt/ccs/blob/main/README.md"
    Write-Host ""
    Write-ColorLine "License: MIT" "Cyan"
}

function Show-Version {
    $UseColors = $env:FORCE_COLOR -or ([Console]::IsOutputRedirected -eq $false -and -not $env:NO_COLOR)

    # Title
    if ($UseColors) {
        Write-Host "CCS (Claude Code Switch) v$CcsVersion" -ForegroundColor White
    } else {
        Write-Host "CCS (Claude Code Switch) v$CcsVersion"
    }
    Write-Host ""

    # Installation
    if ($UseColors) { Write-Host "Installation:" -ForegroundColor Cyan }
    else { Write-Host "Installation:" }

    # Location
    $InstallLocation = (Get-Command ccs -ErrorAction SilentlyContinue).Source
    if ($InstallLocation) {
        if ($UseColors) {
            Write-Host "  Location: " -ForegroundColor Cyan -NoNewline
            Write-Host $InstallLocation
        } else {
            Write-Host "  Location: $InstallLocation"
        }
    } else {
        if ($UseColors) {
            Write-Host "  Location: " -ForegroundColor Cyan -NoNewline
            Write-Host "(not found - run from current directory)" -ForegroundColor Gray
        } else {
            Write-Host "  Location: (not found - run from current directory)"
        }
    }

    # Config
    if ($UseColors) {
        Write-Host "  Config: " -ForegroundColor Cyan -NoNewline
        Write-Host $ConfigFile
    } else {
        Write-Host "  Config: $ConfigFile"
    }

    Write-Host ""

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

    # Set as default if none exists
    if (-not $Data.default) {
        $Data.default = $ProfileName
    }

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

function Copy-GlobalConfigs {
    param([string]$InstancePath)

    $GlobalClaude = "$env:USERPROFILE\.claude"

    # Copy settings.json
    $GlobalSettings = Join-Path $GlobalClaude "settings.json"
    if (Test-Path $GlobalSettings) {
        Copy-Item $GlobalSettings -Destination (Join-Path $InstancePath "settings.json") -ErrorAction SilentlyContinue
    }

    # Copy commands/
    $GlobalCommands = Join-Path $GlobalClaude "commands"
    if (Test-Path $GlobalCommands) {
        Copy-Item $GlobalCommands -Destination $InstancePath -Recurse -ErrorAction SilentlyContinue
    }

    # Copy skills/
    $GlobalSkills = Join-Path $GlobalClaude "skills"
    if (Test-Path $GlobalSkills) {
        Copy-Item $GlobalSkills -Destination $InstancePath -Recurse -ErrorAction SilentlyContinue
    }
}

function Initialize-Instance {
    param([string]$InstancePath)

    # Create base directory with user-only ACL
    New-Item -ItemType Directory -Path $InstancePath -Force | Out-Null
    Set-InstancePermissions $InstancePath

    # Create subdirectories
    $Subdirs = @('session-env', 'todos', 'logs', 'file-history',
                  'shell-snapshots', 'debug', '.anthropic', 'commands', 'skills')

    foreach ($Dir in $Subdirs) {
        $DirPath = Join-Path $InstancePath $Dir
        New-Item -ItemType Directory -Path $DirPath -Force | Out-Null
    }

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

# --- Auth Commands (Phase 3) ---

function Show-AuthHelp {
    Write-Host ""
    Write-Host "CCS Account Management" -ForegroundColor White
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
    Write-Host "  ccs auth create work" -ForegroundColor Yellow
    Write-Host "  ccs auth list" -ForegroundColor Yellow
    Write-Host "  ccs auth remove work --force" -ForegroundColor Yellow
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
    Write-Host "  ccs $ProfileName `"your prompt here`"" -ForegroundColor Yellow
    Write-Host ""
}

function Invoke-AuthList {
    param([string[]]$Args)

    $Verbose = $Args -contains "--verbose"

    if (-not (Test-Path $ProfilesJson)) {
        Write-Host "No account profiles found" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To create your first profile:"
        Write-Host "  ccs auth create <profile>" -ForegroundColor Yellow
        return
    }

    $Data = Read-ProfilesJson
    $Profiles = $Data.profiles.PSObject.Properties.Name

    if ($Profiles.Count -eq 0) {
        Write-Host "No account profiles found" -ForegroundColor Yellow
        return
    }

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

    $ProfileName = $Args[0]

    if (-not $ProfileName) {
        Write-ErrorMsg "Profile name is required`nUsage: ccs auth show <profile>"
        return 1
    }

    if (-not (Test-ProfileExists $ProfileName)) {
        Write-ErrorMsg "Profile not found: $ProfileName"
        return 1
    }

    $Data = Read-ProfilesJson
    $IsDefault = $ProfileName -eq $Data.default

    Write-Host "Profile: $ProfileName" -ForegroundColor White
    Write-Host ""

    $Type = $Data.profiles.$ProfileName.type
    $Created = $Data.profiles.$ProfileName.created
    $LastUsed = $Data.profiles.$ProfileName.last_used
    if (-not $LastUsed) { $LastUsed = "Never" }
    $InstancePath = "$InstancesDir\$(Get-SanitizedProfileName $ProfileName)"

    Write-Host "  Type: $Type"
    Write-Host "  Default: $(if ($IsDefault) { 'Yes' } else { 'No' })"
    Write-Host "  Instance: $InstancePath"
    Write-Host "  Created: $Created"
    Write-Host "  Last used: $LastUsed"
    Write-Host ""
}

function Invoke-AuthRemove {
    param([string[]]$Args)

    $ProfileName = ""
    $Force = $false

    foreach ($arg in $Args) {
        if ($arg -eq "--force") {
            $Force = $true
        } else {
            $ProfileName = $arg
        }
    }

    if (-not $ProfileName) {
        Write-ErrorMsg "Profile name is required`nUsage: ccs auth remove <profile> --force"
        return 1
    }

    if (-not (Test-ProfileExists $ProfileName)) {
        Write-ErrorMsg "Profile not found: $ProfileName"
        return 1
    }

    if (-not $Force) {
        Write-ErrorMsg "Removal requires --force flag for safety`nRun: ccs auth remove $ProfileName --force"
        return 1
    }

    # Delete instance directory
    $InstancePath = "$InstancesDir\$(Get-SanitizedProfileName $ProfileName)"
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

# Special case: auth commands
if ($RemainingArgs.Count -gt 0 -and $RemainingArgs[0] -eq "auth") {
    $AuthArgs = if ($RemainingArgs.Count -gt 1) { $RemainingArgs[1..($RemainingArgs.Count-1)] } else { @() }
    Invoke-AuthCommands $AuthArgs
    exit $LASTEXITCODE
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
    $ErrorMessage = "Profile '$Profile' not found" + "`n`n" +
    "Available profiles:" + "`n" +
    (Get-AvailableProfiles)

    Write-ErrorMsg $ErrorMessage
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
