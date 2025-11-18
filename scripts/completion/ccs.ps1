# PowerShell completion for CCS (Claude Code Switch)
# Compatible with PowerShell 5.1+
#
# Installation:
#   Add to your PowerShell profile ($PROFILE):
#     . /path/to/ccs/scripts/completion/ccs.ps1
#
#   Or install for current user:
#     Copy-Item scripts/completion/ccs.ps1 ~\Documents\PowerShell\Scripts\
#     Add to profile: . ~\Documents\PowerShell\Scripts\ccs.ps1

Register-ArgumentCompleter -CommandName ccs -ScriptBlock {
    param($commandName, $wordToComplete, $commandAst, $fakeBoundParameters)

    $commands = @('auth', 'doctor', 'sync', '--help', '--version', '--shell-completion', '-h', '-v', '-sc')
    $authCommands = @('create', 'list', 'show', 'remove', 'default', '--help', '-h')
    $shellCompletionFlags = @('--bash', '--zsh', '--fish', '--powershell')
    $listFlags = @('--verbose', '--json')
    $removeFlags = @('--yes', '-y')
    $showFlags = @('--json')

    # Get current position in command
    $words = $commandAst.ToString() -split '\s+' | Where-Object { $_ -ne '' }
    $position = $words.Count

    # Helper function to get profiles
    function Get-CcsProfiles {
        param([string]$Type = 'all')

        $profiles = @()

        # Settings-based profiles
        if ($Type -in @('all', 'settings')) {
            $configPath = "$env:USERPROFILE\.ccs\config.json"
            if (Test-Path $configPath) {
                try {
                    $config = Get-Content $configPath -Raw | ConvertFrom-Json
                    $profiles += $config.profiles.PSObject.Properties.Name
                } catch {}
            }
        }

        # Account-based profiles
        if ($Type -in @('all', 'account')) {
            $profilesPath = "$env:USERPROFILE\.ccs\profiles.json"
            if (Test-Path $profilesPath) {
                try {
                    $data = Get-Content $profilesPath -Raw | ConvertFrom-Json
                    $profiles += $data.profiles.PSObject.Properties.Name
                } catch {}
            }
        }

        return $profiles | Sort-Object -Unique
    }

    # Top-level completion
    if ($position -eq 2) {
        $allOptions = $commands + (Get-CcsProfiles)
        $allOptions | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
            [System.Management.Automation.CompletionResult]::new(
                $_,
                $_,
                'ParameterValue',
                $_
            )
        }
        return
    }

    # shell-completion flag completion
    if ($words[1] -eq '--shell-completion' -or $words[1] -eq '-sc') {
        if ($position -eq 3) {
            $shellCompletionFlags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new(
                    $_,
                    $_,
                    'ParameterValue',
                    $_
                )
            }
        }
        return
    }

    # auth subcommand completion
    if ($words[1] -eq 'auth') {
        if ($position -eq 3) {
            # auth subcommands
            $authCommands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new(
                    $_,
                    $_,
                    'ParameterValue',
                    $_
                )
            }
        } elseif ($position -eq 4) {
            # Profile names or flags for auth subcommands
            switch ($words[2]) {
                'show' {
                    $options = (Get-CcsProfiles -Type account) + $showFlags
                    $options | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new(
                            $_,
                            $_,
                            'ParameterValue',
                            $_
                        )
                    }
                }
                'remove' {
                    $options = (Get-CcsProfiles -Type account) + $removeFlags
                    $options | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new(
                            $_,
                            $_,
                            'ParameterValue',
                            $_
                        )
                    }
                }
                'default' {
                    Get-CcsProfiles -Type account | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new(
                            $_,
                            $_,
                            'ParameterValue',
                            $_
                        )
                    }
                }
                'list' {
                    $listFlags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new(
                            $_,
                            $_,
                            'ParameterValue',
                            $_
                        )
                    }
                }
                'create' {
                    # No completion for create (user types new name)
                }
            }
        } elseif ($position -eq 5) {
            # Flags after profile name
            switch ($words[2]) {
                'show' {
                    $showFlags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new(
                            $_,
                            $_,
                            'ParameterValue',
                            $_
                        )
                    }
                }
                'remove' {
                    $removeFlags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
                        [System.Management.Automation.CompletionResult]::new(
                            $_,
                            $_,
                            'ParameterValue',
                            $_
                        )
                    }
                }
            }
        }
    }
}
