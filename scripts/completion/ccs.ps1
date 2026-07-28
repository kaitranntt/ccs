# PowerShell completion for CCS (Claude Codex Switch)

function Invoke-CcsCompletionBackend {
    param(
        [string]$CurrentWord,
        [string[]]$TokensBeforeCurrent
    )

    if (Get-Command ccs -ErrorAction SilentlyContinue) {
        & ccs __complete --shell powershell --current $CurrentWord -- @TokensBeforeCurrent 2>$null
    }
}

Register-ArgumentCompleter -CommandName ccs -ScriptBlock {
    param($commandName, $wordToComplete, $commandAst, $fakeBoundParameters)

    $commandElements = @($commandAst.CommandElements | ForEach-Object { $_.Extent.Text })
    $tokensBeforeCurrent = @()
    if ($commandElements.Count -gt 1) {
        $tokensBeforeCurrent = $commandElements[1..($commandElements.Count - 1)]
        if ($tokensBeforeCurrent.Count -gt 0 -and $tokensBeforeCurrent[-1] -eq $wordToComplete) {
            $tokensBeforeCurrent = if ($tokensBeforeCurrent.Count -gt 1) {
                $tokensBeforeCurrent[0..($tokensBeforeCurrent.Count - 2)]
            } else {
                @()
            }
        }
    }

    foreach ($line in Invoke-CcsCompletionBackend -CurrentWord $wordToComplete -TokensBeforeCurrent $tokensBeforeCurrent) {
        if ([string]::IsNullOrWhiteSpace($line)) {
            continue
        }

        $parts = $line -split "`t", 2
        $value = $parts[0]
        $description = if ($parts.Count -gt 1) { $parts[1] } else { $parts[0] }

        [System.Management.Automation.CompletionResult]::new(
            $value,
            $value,
            'ParameterValue',
            $description
        )
    }
}
