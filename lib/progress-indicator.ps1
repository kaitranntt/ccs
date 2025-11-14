# CCS Progress Indicator (PowerShell 5.1+ compatible)
# Simple spinner for long-running operations
# NO external dependencies - ASCII-only for cross-platform compatibility

$ErrorActionPreference = "Stop"

# Show simple spinner (synchronous)
function Show-Spinner {
    param(
        [string]$Message,
        [scriptblock]$Task
    )

    # TTY detection: only animate if not redirected and not in CI
    $IsTTY = -not [Console]::IsOutputRedirected -and -not $env:CI -and -not $env:NO_COLOR

    $StartTime = Get-Date

    if (-not $IsTTY) {
        # Non-TTY: just print message and run task
        Write-Host "[i] $Message..." -ForegroundColor Gray
        $result = & $Task
        Write-Host "[OK] $Message" -ForegroundColor Green
        return $result
    }

    # ASCII-only frames for cross-platform compatibility
    $Frames = @('|', '/', '-', '\')
    $FrameIndex = 0

    # Start task in background job
    $Job = Start-Job -ScriptBlock $Task

    try {
        # Animate spinner while job is running
        while ($Job.State -eq 'Running') {
            $Frame = $Frames[$FrameIndex]
            $Elapsed = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
            Write-Host "`r[$Frame] $Message... ($($Elapsed)s)" -NoNewline -ForegroundColor Cyan
            $FrameIndex = ($FrameIndex + 1) % $Frames.Length
            Start-Sleep -Milliseconds 100
        }

        # Clear spinner line
        Write-Host "`r$(' ' * 80)`r" -NoNewline

        # Check job result
        $JobResult = Receive-Job -Job $Job -ErrorAction Stop
        $Elapsed = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
        Write-Host "[OK] $Message ($($Elapsed)s)" -ForegroundColor Green

        return $JobResult
    }
    catch {
        # Clear spinner line
        Write-Host "`r$(' ' * 80)`r" -NoNewline
        Write-Host "[X] $Message" -ForegroundColor Red
        throw
    }
    finally {
        # Cleanup job
        if ($Job) {
            Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
        }
    }
}

# Show progress counter for multi-step operations
function Show-ProgressStep {
    param(
        [int]$Current,
        [int]$Total,
        [string]$Message
    )

    # TTY detection
    $IsTTY = -not [Console]::IsOutputRedirected -and -not $env:CI

    if (-not $IsTTY) {
        Write-Host "[$Current/$Total] $Message" -ForegroundColor Gray
        return
    }

    # Show progress with carriage return (can be overwritten)
    Write-Host "`r[$Current/$Total] $Message..." -NoNewline -ForegroundColor Cyan
}

# Clear progress line
function Clear-Progress {
    $IsTTY = -not [Console]::IsOutputRedirected -and -not $env:CI

    if ($IsTTY) {
        Write-Host "`r$(' ' * 80)`r" -NoNewline
    }
}

# Simple status message (for operations that don't need spinners)
function Write-Status {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Success', 'Warning', 'Error')]
        [string]$Type = 'Info'
    )

    $Prefix = switch ($Type) {
        'Info' { '[i]'; break }
        'Success' { '[OK]'; break }
        'Warning' { '[!]'; break }
        'Error' { '[X]'; break }
    }

    $Color = switch ($Type) {
        'Info' { 'Gray'; break }
        'Success' { 'Green'; break }
        'Warning' { 'Yellow'; break }
        'Error' { 'Red'; break }
    }

    Write-Host "$Prefix $Message" -ForegroundColor $Color
}
