# Shell Completion for CCS

Tab completion for CCS commands, subcommands, profiles, and flags.

## Features

- Complete profile names (both settings-based and account-based)
- Complete `ccs auth` subcommands (create, list, show, remove, default)
- Complete flags (`--help`, `--version`, `--json`, `--verbose`, `--yes`)
- Complete profile names for auth subcommands
- Context-aware: suggests relevant options based on current command

## Installation

### Bash

**Option 1: User installation (recommended)**

Add to `~/.bashrc` or `~/.bash_profile`:

```bash
source /path/to/ccs/scripts/completion/ccs.bash
```

Then reload your shell:
```bash
source ~/.bashrc
```

**Option 2: System-wide installation (requires sudo)**

```bash
sudo cp scripts/completion/ccs.bash /etc/bash_completion.d/ccs
```

### Zsh

**Option 1: User installation (recommended)**

1. Create completion directory if it doesn't exist:
   ```zsh
   mkdir -p ~/.zsh/completion
   ```

2. Copy the completion script:
   ```zsh
   cp scripts/completion/ccs.zsh ~/.zsh/completion/_ccs
   ```

3. Add to `~/.zshrc`:
   ```zsh
   fpath=(~/.zsh/completion $fpath)
   autoload -Uz compinit && compinit
   ```

4. Reload your shell:
   ```zsh
   source ~/.zshrc
   ```

**Option 2: System-wide installation (requires sudo)**

```zsh
sudo cp scripts/completion/ccs.zsh /usr/local/share/zsh/site-functions/_ccs
```

Then rebuild completion cache:
```zsh
rm ~/.zcompdump && compinit
```

### PowerShell

**Option 1: User installation (recommended)**

Add to your PowerShell profile (`$PROFILE`):

```powershell
. C:\path\to\ccs\scripts\completion\ccs.ps1
```

Then reload your profile:
```powershell
. $PROFILE
```

**Option 2: Install to Scripts directory**

```powershell
# Create Scripts directory if it doesn't exist
New-Item -Path ~\Documents\PowerShell\Scripts -ItemType Directory -Force

# Copy completion script
Copy-Item scripts\completion\ccs.ps1 ~\Documents\PowerShell\Scripts\

# Add to profile
Add-Content $PROFILE ". ~\Documents\PowerShell\Scripts\ccs.ps1"
```

## Usage Examples

### Basic Completion

```bash
$ ccs <TAB>
auth      doctor    glm       glmt      kimi      work      personal  --help    --version

$ ccs auth <TAB>
create    list      show      remove    default   --help
```

### Profile Completion

```bash
$ ccs auth show <TAB>
work      personal  team      --json

$ ccs auth remove <TAB>
work      personal  team      --yes     -y
```

### Flag Completion

```bash
$ ccs auth list <TAB>
--verbose --json

$ ccs auth show work <TAB>
--json
```

## Completion Behavior

### Top-level (after `ccs`)
- Built-in commands: `auth`, `doctor`
- Flags: `--help`, `--version`, `-h`, `-v`
- Settings-based profiles: from `~/.ccs/config.json`
- Account-based profiles: from `~/.ccs/profiles.json`

### After `ccs auth`
- Subcommands: `create`, `list`, `show`, `remove`, `default`
- Flags: `--help`, `-h`

### After `ccs auth <subcommand>`
- **create**: No completion (user enters new profile name)
  - Flags: `--force`
- **list**: No profile completion
  - Flags: `--verbose`, `--json`
- **show**: Account profiles only
  - Flags: `--json`
- **remove**: Account profiles only
  - Flags: `--yes`, `-y`
- **default**: Account profiles only

### After `ccs <profile>`
- No completion (Claude CLI arguments are free-form)

## Troubleshooting

### Bash: Completion not working

1. Check if bash-completion is installed:
   ```bash
   # macOS
   brew install bash-completion

   # Ubuntu/Debian
   sudo apt install bash-completion
   ```

2. Verify jq is installed (required for profile completion):
   ```bash
   command -v jq
   ```

3. Check if completion is loaded:
   ```bash
   complete -p ccs
   ```

   Should output:
   ```
   complete -F _ccs_completion ccs
   ```

### Zsh: Completion not working

1. Verify completion system is enabled in `~/.zshrc`:
   ```zsh
   autoload -Uz compinit && compinit
   ```

2. Check if completion is loaded:
   ```zsh
   which _ccs
   ```

3. Rebuild completion cache:
   ```zsh
   rm ~/.zcompdump && compinit
   ```

### PowerShell: Completion not working

1. Check PowerShell version (5.1+ required):
   ```powershell
   $PSVersionTable.PSVersion
   ```

2. Verify profile is loaded:
   ```powershell
   Test-Path $PROFILE
   ```

3. Check if completion is registered:
   ```powershell
   (Get-ArgumentCompleter).CommandName | Select-String ccs
   ```

## Technical Details

### Bash Implementation
- Uses `complete -F` for programmable completion
- Compatible with bash 3.2+ (macOS default)
- Reads profiles dynamically using `jq`
- Context-aware based on `COMP_CWORD` and `COMP_WORDS`

### Zsh Implementation
- Uses `_arguments` and `_describe` for rich completion
- Compatible with zsh 5.0+
- Supports completion descriptions
- Context-aware using `$state` and `$words`

### PowerShell Implementation
- Uses `Register-ArgumentCompleter`
- Compatible with PowerShell 5.1+
- Reads profiles dynamically using `ConvertFrom-Json`
- Provides `CompletionResult` objects

## Dependencies

- **jq**: Required for reading profiles from JSON files
  - Install: `brew install jq` (macOS) or `apt install jq` (Ubuntu)
  - Already required by CCS core functionality

## Contributing

When adding new commands or flags:
1. Update all three completion scripts (bash, zsh, PowerShell)
2. Test on each platform
3. Update this README with new completion examples
4. Maintain cross-platform parity

## See Also

- [CCS Documentation](https://github.com/kaitranntt/ccs)
- [Bash Programmable Completion](https://www.gnu.org/software/bash/manual/html_node/Programmable-Completion.html)
- [Zsh Completion System](http://zsh.sourceforge.net/Doc/Release/Completion-System.html)
- [PowerShell Argument Completers](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/register-argumentcompleter)
