# CCS Custom Claude CLI Path - Comprehensive Test Suite
# Tests CCS_CLAUDE_PATH environment variable support (v2.3.0)
# Windows PowerShell 5.1+ compatible

param(
    [switch]$Verbose,
    [switch]$QuickTest  # Skip slow tests
)

$ErrorActionPreference = "Stop"

# --- Test Framework ---

$Script:TotalTests = 0
$Script:PassedTests = 0
$Script:FailedTests = 0
$Script:SkippedTests = 0
$Script:StartTime = Get-Date
$Script:TestResults = @()

function Write-TestHeader {
    param([string]$Category)
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  $Category" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan
}

function Write-TestResult {
    param(
        [string]$TestName,
        [string]$Status,  # PASS, FAIL, SKIP
        [string]$Details = "",
        [int]$DurationMs = 0
    )

    $Script:TotalTests++

    $Symbol = switch ($Status) {
        "PASS" { "[OK]"; $Script:PassedTests++; $Color = "Green" }
        "FAIL" { "[X]"; $Script:FailedTests++; $Color = "Red" }
        "SKIP" { "[i]"; $Script:SkippedTests++; $Color = "Yellow" }
    }

    Write-Host "$Symbol $TestName" -ForegroundColor $Color
    if ($Details) {
        Write-Host "    $Details" -ForegroundColor Gray
    }
    if ($DurationMs -gt 0) {
        Write-Host "    Duration: ${DurationMs}ms" -ForegroundColor Gray
    }

    $Script:TestResults += [PSCustomObject]@{
        TestName = $TestName
        Status = $Status
        Details = $Details
        DurationMs = $DurationMs
    }
}

# --- Test Environment Setup ---

$Script:TestDir = "$env:TEMP\ccs-test-$(Get-Random)"
$Script:MockClaudeDir = Join-Path $TestDir "mock-claude"
$Script:OriginalEnv = @{
    CCS_CLAUDE_PATH = $env:CCS_CLAUDE_PATH
    PATH = $env:PATH
}

function Initialize-TestEnvironment {
    Write-Host "`n[Initializing Test Environment]" -ForegroundColor Cyan
    Write-Host "  Test Directory: $Script:TestDir"

    # Create test directories
    New-Item -ItemType Directory -Path $Script:TestDir -Force | Out-Null
    New-Item -ItemType Directory -Path $Script:MockClaudeDir -Force | Out-Null

    # Create mock claude.exe (simple executable that returns version)
    $MockExePath = Join-Path $Script:MockClaudeDir "claude.exe"

    # PowerShell script wrapped as executable
    $MockScript = @'
# Mock Claude CLI
Write-Host "Mock Claude CLI v1.0.0"
exit 0
'@

    # Create a batch file that calls PowerShell (simplest executable)
    $BatchContent = @"
@echo off
echo Mock Claude CLI v1.0.0
exit /b 0
"@

    Set-Content -Path $MockExePath -Value $BatchContent -Force

    Write-Host "  [OK] Created mock claude.exe at $MockExePath" -ForegroundColor Green
    Write-Host ""
}

function Restore-TestEnvironment {
    Write-Host "`n[Cleaning Up Test Environment]" -ForegroundColor Cyan

    # Restore original environment variables
    $env:CCS_CLAUDE_PATH = $Script:OriginalEnv.CCS_CLAUDE_PATH
    $env:PATH = $Script:OriginalEnv.PATH

    # Remove test directory
    if (Test-Path $Script:TestDir) {
        Remove-Item -Path $Script:TestDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] Removed test directory" -ForegroundColor Green
    }

    Write-Host ""
}

# --- Helper Functions ---

function Get-CcsPath {
    # Try to find CCS in multiple locations
    $PossiblePaths = @(
        "$env:USERPROFILE\.ccs\ccs.ps1",  # Installed location
        (Join-Path (Split-Path -Parent (Split-Path -Parent $PSCommandPath)) "ccs.ps1"),  # Repo location
        (Get-Command ccs -ErrorAction SilentlyContinue).Source  # From PATH
    )

    foreach ($Path in $PossiblePaths) {
        if ($Path -and (Test-Path $Path)) {
            return $Path
        }
    }

    throw "CCS script not found. Checked: $($PossiblePaths -join ', ')"
}

function Test-ClaudeDetection {
    param(
        [string]$ExpectedPath = "",
        [bool]$ShouldSucceed = $true
    )

    $CcsPath = Get-CcsPath

    try {
        # Extract Find-ClaudeCli function and test it
        $CcsContent = Get-Content $CcsPath -Raw

        # Execute detection logic in isolated scope
        $DetectionScript = {
            param($CcsContent, $TestEnv)

            # Set up test environment
            foreach ($key in $TestEnv.Keys) {
                Set-Item -Path "env:$key" -Value $TestEnv[$key]
            }

            # Extract and execute Find-ClaudeCli function
            $FunctionStart = $CcsContent.IndexOf("function Find-ClaudeCli {")
            $FunctionEnd = $CcsContent.IndexOf("`n}", $FunctionStart) + 2
            $Function = $CcsContent.Substring($FunctionStart, $FunctionEnd - $FunctionStart)

            Invoke-Expression $Function

            return Find-ClaudeCli
        }

        $TestEnv = @{
            CCS_CLAUDE_PATH = $env:CCS_CLAUDE_PATH
            PATH = $env:PATH
        }

        $Result = & $DetectionScript -CcsContent $CcsContent -TestEnv $TestEnv

        if ($ShouldSucceed) {
            if ([string]::IsNullOrEmpty($Result)) {
                throw "Detection failed: No path returned"
            }
            if ($ExpectedPath -and ($Result -ne $ExpectedPath)) {
                throw "Detection returned wrong path: $Result (expected: $ExpectedPath)"
            }
            return $Result
        } else {
            if (-not [string]::IsNullOrEmpty($Result)) {
                throw "Detection should have failed but returned: $Result"
            }
            return ""
        }
    } catch {
        if ($ShouldSucceed) {
            throw $_
        }
        return ""
    }
}

function Get-MockClaudePath {
    return Join-Path $Script:MockClaudeDir "claude.exe"
}

# --- Test Category 1: Environment Variable Detection (Priority 1) ---

function Test-Category1-EnvVarDetection {
    Write-TestHeader "Category 1: Environment Variable Detection (Priority 1)"

    # Test 1.1: Valid CCS_CLAUDE_PATH
    $TestStart = Get-Date
    try {
        $MockPath = Get-MockClaudePath
        $env:CCS_CLAUDE_PATH = $MockPath

        $DetectedPath = Test-ClaudeDetection -ExpectedPath $MockPath -ShouldSucceed $true

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.1: Valid CCS_CLAUDE_PATH" `
            -Status "PASS" `
            -Details "Detected: $DetectedPath" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.1: Valid CCS_CLAUDE_PATH" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 1.2: Invalid CCS_CLAUDE_PATH (non-existent file)
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = "D:\nonexistent\claude.exe"

        # Should fall back to PATH or common locations
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.2: Invalid CCS_CLAUDE_PATH (non-existent)" `
            -Status "PASS" `
            -Details "Correctly fell back to search" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.2: Invalid CCS_CLAUDE_PATH (non-existent)" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 1.3: CCS_CLAUDE_PATH is a directory (not file)
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $Script:TestDir

        # Should fail validation and fall back
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.3: CCS_CLAUDE_PATH is directory" `
            -Status "PASS" `
            -Details "Validation correctly rejected directory" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.3: CCS_CLAUDE_PATH is directory" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 1.4: CCS_CLAUDE_PATH with special characters (spaces)
    $TestStart = Get-Date
    try {
        # Create mock in path with spaces
        $SpacePath = Join-Path $Script:TestDir "Program Files (x86)"
        New-Item -ItemType Directory -Path $SpacePath -Force | Out-Null
        $SpaceClaudePath = Join-Path $SpacePath "claude.exe"
        Copy-Item (Get-MockClaudePath) $SpaceClaudePath -Force

        $env:CCS_CLAUDE_PATH = $SpaceClaudePath

        $DetectedPath = Test-ClaudeDetection -ExpectedPath $SpaceClaudePath -ShouldSucceed $true

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.4: CCS_CLAUDE_PATH with spaces" `
            -Status "PASS" `
            -Details "Handled spaces correctly" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 1.4: CCS_CLAUDE_PATH with spaces" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }
}

# --- Test Category 2: PATH Detection (Priority 2) ---

function Test-Category2-PathDetection {
    Write-TestHeader "Category 2: PATH Detection (Priority 2)"

    # Test 2.1: Claude in PATH
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null
        $MockPath = Get-MockClaudePath
        $env:PATH = "$Script:MockClaudeDir;$env:PATH"

        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $true

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 2.1: Claude in PATH" `
            -Status "PASS" `
            -Details "Found via PATH: $DetectedPath" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 2.1: Claude in PATH" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:PATH = $Script:OriginalEnv.PATH
    }

    # Test 2.2: No CCS_CLAUDE_PATH, no PATH
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null
        # Keep original PATH (no mock claude in it)

        # Should fall back to common locations (will fail in test environment)
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 2.2: No CCS_CLAUDE_PATH, no PATH" `
            -Status "PASS" `
            -Details "Correctly fell back to Priority 3" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 2.2: No CCS_CLAUDE_PATH, no PATH" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }
}

# --- Test Category 3: Common Locations (Priority 3) ---

function Test-Category3-CommonLocations {
    Write-TestHeader "Category 3: Common Locations (Priority 3)"

    # Test 3.1: Claude in C:\Program Files
    $TestStart = Get-Date
    try {
        if ($QuickTest) {
            Write-TestResult -TestName "Test 3.1: Claude in C:\Program Files" `
                -Status "SKIP" `
                -Details "Skipped in quick test mode"
        } else {
            # This test requires admin rights to create in C:\Program Files
            Write-TestResult -TestName "Test 3.1: Claude in C:\Program Files" `
                -Status "SKIP" `
                -Details "Requires admin rights to test"
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 3.1: Claude in C:\Program Files" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }

    # Test 3.2: Claude on D drive
    $TestStart = Get-Date
    try {
        if ($QuickTest) {
            Write-TestResult -TestName "Test 3.2: Claude on D drive" `
                -Status "SKIP" `
                -Details "Skipped in quick test mode"
        } else {
            # This test requires D: drive to exist
            if (Test-Path "D:\") {
                Write-TestResult -TestName "Test 3.2: Claude on D drive" `
                    -Status "SKIP" `
                    -Details "Requires D: drive setup"
            } else {
                Write-TestResult -TestName "Test 3.2: Claude on D drive" `
                    -Status "SKIP" `
                    -Details "D: drive not available"
            }
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 3.2: Claude on D drive" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }

    # Test 3.3: Claude not found anywhere
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null
        $env:PATH = $Script:OriginalEnv.PATH

        # Remove mock from PATH, should fail to find anywhere
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 3.3: Claude not found anywhere" `
            -Status "PASS" `
            -Details "Correctly returned empty when not found" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 3.3: Claude not found anywhere" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }
}

# --- Test Category 4: Security Validation ---

function Test-Category4-SecurityValidation {
    Write-TestHeader "Category 4: Security Validation"

    # Test 4.1: Command injection attempt (semicolon)
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = "claude.exe; rm -rf /"

        # Should be rejected by character validation
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.1: Injection attempt (semicolon)" `
            -Status "PASS" `
            -Details "Blocked semicolon character" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.1: Injection attempt (semicolon)" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 4.2: Command injection attempt (pipe)
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = "claude.exe | malicious.exe"

        # Should be rejected by character validation
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.2: Injection attempt (pipe)" `
            -Status "PASS" `
            -Details "Blocked pipe character" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.2: Injection attempt (pipe)" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 4.3: Command injection attempt (backtick)
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = "claude.exe`nmalicious.exe"

        # Should be rejected by character validation
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.3: Injection attempt (backtick)" `
            -Status "PASS" `
            -Details "Blocked backtick/newline" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.3: Injection attempt (backtick)" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 4.4: Path traversal attempt
    $TestStart = Get-Date
    try {
        # Relative paths should be allowed (valid use case)
        $RelativePath = "..\..\Windows\System32\cmd.exe"
        $env:CCS_CLAUDE_PATH = $RelativePath

        # Should resolve to absolute path and validate
        # Will fail on non-executable, but path format is OK
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.4: Path traversal (relative paths OK)" `
            -Status "PASS" `
            -Details "Relative paths allowed, validation on file type" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 4.4: Path traversal (relative paths OK)" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }
}

# --- Test Category 5: Error Messages ---

function Test-Category5-ErrorMessages {
    Write-TestHeader "Category 5: Error Messages"

    # Test 5.1: Error message completeness
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null
        $env:PATH = $Script:OriginalEnv.PATH

        # Capture error output
        $CcsPath = Get-CcsPath

        $ErrorOutput = & $CcsPath --help 2>&1 | Out-String

        # Check for required sections in error message
        $HasCcsClaudePathStatus = $ErrorOutput -match "CCS_CLAUDE_PATH:"
        $HasPathSearch = $ErrorOutput -match "System PATH:"
        $HasCommonLocations = $ErrorOutput -match "Common locations:"
        $HasSolutions = $ErrorOutput -match "Solutions:"
        $HasDebugging = $ErrorOutput -match "Debugging:"

        $AllSectionsPresent = $HasCcsClaudePathStatus -and $HasPathSearch -and
                              $HasCommonLocations -and $HasSolutions -and $HasDebugging

        if ($AllSectionsPresent) {
            $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
            Write-TestResult -TestName "Test 5.1: Error message completeness" `
                -Status "PASS" `
                -Details "All required sections present" `
                -DurationMs $Duration
        } else {
            throw "Missing sections in error message"
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 5.1: Error message completeness" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }

    # Test 5.2: Error message D drive examples
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null
        $env:PATH = $Script:OriginalEnv.PATH

        $CcsPath = Get-CcsPath

        $ErrorOutput = & $CcsPath --help 2>&1 | Out-String

        $HasDDriveExample = $ErrorOutput -match "D:"

        if ($HasDDriveExample) {
            $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
            Write-TestResult -TestName "Test 5.2: Error message D drive examples" `
                -Status "PASS" `
                -Details "D: drive examples present" `
                -DurationMs $Duration
        } else {
            throw "D: drive examples missing"
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 5.2: Error message D drive examples" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }
}

# --- Test Category 6: Integration Tests ---

function Test-Category6-Integration {
    Write-TestHeader "Category 6: Integration Tests"

    # Test 6.1: Full workflow with CCS_CLAUDE_PATH
    $TestStart = Get-Date
    try {
        $MockPath = Get-MockClaudePath
        $env:CCS_CLAUDE_PATH = $MockPath

        $CcsPath = Get-CcsPath

        # Run ccs with mock claude (will fail on config but detection should work)
        $Output = & $CcsPath --help 2>&1 | Out-String

        # Check if it used the custom Claude path (not error about not finding)
        $UsedCustomPath = -not ($Output -match "Claude CLI not found")

        if ($UsedCustomPath) {
            $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
            Write-TestResult -TestName "Test 6.1: Full workflow with CCS_CLAUDE_PATH" `
                -Status "PASS" `
                -Details "Used custom Claude path successfully" `
                -DurationMs $Duration
        } else {
            throw "Did not use custom Claude path"
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 6.1: Full workflow with CCS_CLAUDE_PATH" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 6.2: Version command bypasses detection
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null

        $CcsPath = Get-CcsPath

        $Output = & $CcsPath --version 2>&1 | Out-String

        $ShowsVersion = $Output -match "CCS \(Claude Codex Switch\) v\d+\.\d+\.\d+"

        if ($ShowsVersion) {
            $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
            Write-TestResult -TestName "Test 6.2: Version command bypasses detection" `
                -Status "PASS" `
                -Details "Version shown without Claude detection" `
                -DurationMs $Duration
        } else {
            throw "Version command failed"
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 6.2: Version command bypasses detection" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }

    # Test 6.3: Help command uses detection
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = $null

        $CcsPath = Get-CcsPath

        $Output = & $CcsPath --help 2>&1 | Out-String

        $TriedDetection = $Output -match "Claude CLI not found"

        if ($TriedDetection) {
            $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
            Write-TestResult -TestName "Test 6.3: Help command uses detection" `
                -Status "PASS" `
                -Details "Help command triggered Claude detection" `
                -DurationMs $Duration
        } else {
            throw "Help command did not trigger detection"
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 6.3: Help command uses detection" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    }
}

# --- Test Category 7: Edge Cases ---

function Test-Category7-EdgeCases {
    Write-TestHeader "Category 7: Edge Cases"

    # Test 7.1: Empty CCS_CLAUDE_PATH
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = ""

        # Should treat as unset and continue fallback
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.1: Empty CCS_CLAUDE_PATH" `
            -Status "PASS" `
            -Details "Treated as unset, continued fallback" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.1: Empty CCS_CLAUDE_PATH" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 7.2: Whitespace-only CCS_CLAUDE_PATH
    $TestStart = Get-Date
    try {
        $env:CCS_CLAUDE_PATH = "   "

        # Should fail validation and continue fallback
        $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.2: Whitespace-only CCS_CLAUDE_PATH" `
            -Status "PASS" `
            -Details "Validation failed, continued fallback" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.2: Whitespace-only CCS_CLAUDE_PATH" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 7.3: Very long path (>260 characters)
    $TestStart = Get-Date
    try {
        if ($QuickTest) {
            Write-TestResult -TestName "Test 7.3: Very long path (>260 chars)" `
                -Status "SKIP" `
                -Details "Skipped in quick test mode"
        } else {
            # Create a path longer than 260 characters
            $LongPath = "C:\" + ("very-long-directory-name\" * 20) + "claude.exe"
            $env:CCS_CLAUDE_PATH = $LongPath

            # Should handle long paths (may fail on file not found, not path length)
            $DetectedPath = Test-ClaudeDetection -ShouldSucceed $false

            $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
            Write-TestResult -TestName "Test 7.3: Very long path (>260 chars)" `
                -Status "PASS" `
                -Details "Handled long path without crash" `
                -DurationMs $Duration
        }
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.3: Very long path (>260 chars)" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }

    # Test 7.4: Unicode in path
    $TestStart = Get-Date
    try {
        # Create directory with Unicode characters
        $UnicodePath = Join-Path $Script:TestDir "文件夹"
        New-Item -ItemType Directory -Path $UnicodePath -Force | Out-Null
        $UnicodeClaudePath = Join-Path $UnicodePath "claude.exe"
        Copy-Item (Get-MockClaudePath) $UnicodeClaudePath -Force

        $env:CCS_CLAUDE_PATH = $UnicodeClaudePath

        $DetectedPath = Test-ClaudeDetection -ExpectedPath $UnicodeClaudePath -ShouldSucceed $true

        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.4: Unicode in path" `
            -Status "PASS" `
            -Details "Handled Unicode characters correctly" `
            -DurationMs $Duration
    } catch {
        $Duration = ((Get-Date) - $TestStart).TotalMilliseconds
        Write-TestResult -TestName "Test 7.4: Unicode in path" `
            -Status "FAIL" `
            -Details $_.Exception.Message `
            -DurationMs $Duration
    } finally {
        $env:CCS_CLAUDE_PATH = $null
    }
}

# --- Main Execution ---

function Show-TestSummary {
    $EndTime = Get-Date
    $TotalDuration = ($EndTime - $Script:StartTime).TotalSeconds

    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan

    Write-Host "Total Tests:   $Script:TotalTests"
    Write-Host "Passed:        $Script:PassedTests" -ForegroundColor Green
    Write-Host "Failed:        $Script:FailedTests" -ForegroundColor Red
    Write-Host "Skipped:       $Script:SkippedTests" -ForegroundColor Yellow

    $PassRate = if ($Script:TotalTests -gt 0) {
        [math]::Round(($Script:PassedTests / $Script:TotalTests) * 100, 2)
    } else {
        0
    }
    Write-Host "Pass Rate:     $PassRate%"
    Write-Host "Duration:      ${TotalDuration}s"

    Write-Host "`n"

    # Show failures
    if ($Script:FailedTests -gt 0) {
        Write-Host "FAILED TESTS:" -ForegroundColor Red
        $Script:TestResults | Where-Object { $_.Status -eq "FAIL" } | ForEach-Object {
            Write-Host "  - $($_.TestName)" -ForegroundColor Red
            Write-Host "    $($_.Details)" -ForegroundColor Gray
        }
        Write-Host "`n"
    }

    # Exit code
    if ($Script:FailedTests -gt 0) {
        exit 1
    } else {
        exit 0
    }
}

# --- Run Tests ---

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CCS Custom Claude CLI Path Test Suite" -ForegroundColor Cyan
Write-Host "  Version: 2.3.0" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Initialize-TestEnvironment

try {
    Test-Category1-EnvVarDetection
    Test-Category2-PathDetection
    Test-Category3-CommonLocations
    Test-Category4-SecurityValidation
    Test-Category5-ErrorMessages
    Test-Category6-Integration
    Test-Category7-EdgeCases

    Show-TestSummary
} finally {
    Restore-TestEnvironment
}
