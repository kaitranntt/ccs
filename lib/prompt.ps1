# CCS Interactive Prompt Utilities (PowerShell 5.1+ compatible)
# NO external dependencies

$ErrorActionPreference = "Stop"

# Interactive confirmation prompt
function Confirm-Action {
    param(
        [string]$Message,
        [ValidateSet('Yes', 'No')]
        [string]$Default = 'No'
    )

    # Check for --yes flag (automation)
    if ($env:CCS_YES -eq '1' -or $global:RemainingArgs -contains '--yes' -or $global:RemainingArgs -contains '-y') {
        return $Default -eq 'Yes'
    }

    # Check for --no-input flag (CI)
    if ($env:CCS_NO_INPUT -eq '1' -or $global:RemainingArgs -contains '--no-input') {
        Write-Host "[X] Interactive input required but --no-input specified" -ForegroundColor Red
        exit 1
    }

    # Non-TTY: use default
    if ([Console]::IsInputRedirected) {
        return $Default -eq 'Yes'
    }

    # Interactive prompt
    $PromptText = if ($Default -eq 'Yes') {
        "$Message [Y/n]: "
    } else {
        "$Message [y/N]: "
    }

    while ($true) {
        Write-Host $PromptText -NoNewline -ForegroundColor Cyan
        $Response = Read-Host

        $Normalized = $Response.Trim().ToLower()

        # Empty answer: use default
        if ($Normalized -eq '' -or $Normalized -eq ' ') {
            return $Default -eq 'Yes'
        }

        # Valid answers
        if ($Normalized -eq 'y' -or $Normalized -eq 'yes') {
            return $true
        }

        if ($Normalized -eq 'n' -or $Normalized -eq 'no') {
            return $false
        }

        # Invalid input: retry
        Write-Host "[!] Please answer y or n" -ForegroundColor Yellow
    }
}

# Interactive text input
function Read-Input {
    param(
        [string]$Message,
        [string]$Default = '',
        [scriptblock]$Validate = $null
    )

    # Non-TTY: use default or error
    if ([Console]::IsInputRedirected) {
        if ($Default) {
            return $Default
        }
        throw "Interactive input required but stdin is redirected"
    }

    # Interactive prompt
    $PromptText = if ($Default) {
        "$Message [$Default]: "
    } else {
        "$Message: "
    }

    while ($true) {
        Write-Host $PromptText -NoNewline -ForegroundColor Cyan
        $Response = Read-Host

        $Value = if ($Response.Trim()) { $Response.Trim() } else { $Default }

        # Validate input if validator provided
        if ($Validate) {
            $Error = & $Validate $Value
            if ($Error) {
                Write-Host "[!] $Error" -ForegroundColor Yellow
                continue
            }
        }

        return $Value
    }
}

# Check if running in non-interactive mode
function Test-NonInteractive {
    return [Console]::IsInputRedirected -or
           $env:CCS_YES -eq '1' -or
           $env:CCS_NO_INPUT -eq '1'
}
