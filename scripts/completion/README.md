# Shell Completion for CCS

Tab completion for CCS commands, subcommands, profiles, and flags.

**Supported Shells:** Bash, Zsh, Fish, PowerShell

## Features

- Complete profile names (both settings-based and account-based)
- Complete `ccs auth` subcommands (create, list, show, remove, default)
- Complete flags (`--help`, `--version`, `--json`, `--verbose`, `--yes`)
- Complete profile names for auth subcommands
- Context-aware: suggests relevant options based on current command

## Quick Install (Recommended)

```bash
ccs --shell-completion
```

This will:
- Auto-detect your shell
- Copy completion files to `~/.ccs/completions/`
- Configure your shell profile with proper comment markers
- Show instructions to activate

**Manual shell selection:**
```bash
ccs --shell-completion --bash        # Force bash
ccs --shell-completion --zsh         # Force zsh
ccs --shell-completion --fish        # Force fish
ccs --shell-completion --powershell  # Force PowerShell
```

## Manual Installation

Completion files are installed to `~/.ccs/completions/` during `npm install`.

### Bash

Add to `~/.bashrc` or `~/.bash_profile`:

```bash
# CCS shell completion
source ~/.ccs/completions/ccs.bash
```

Then reload:
```bash
source ~/.bashrc
```

### Zsh

1. Create completion directory:
   ```zsh
   mkdir -p ~/.zsh/completion
   ```

2. Copy completion file:
   ```zsh
   cp ~/.ccs/completions/ccs.zsh ~/.zsh/completion/_ccs
   ```

3. Add to `~/.zshrc`:
   ```zsh
   # CCS shell completion
   fpath=(~/.zsh/completion $fpath)
   autoload -Uz compinit && compinit
   ```

4. Reload:
   ```zsh
   source ~/.zshrc
   ```

### PowerShell

Add to your PowerShell profile (`$PROFILE`):

```powershell
# CCS shell completion
. "$HOME\.ccs\completions\ccs.ps1"
```

Then reload:
```powershell
. $PROFILE
```

### Fish

**User installation (recommended)**

Fish automatically loads completions from `~/.config/fish/completions/`:

```fish
# Create completion directory if it doesn't exist
mkdir -p ~/.config/fish/completions

# Copy completion script
cp scripts/completion/ccs.fish ~/.config/fish/completions/
```

That's it! Fish will automatically load the completion on demand. No need to source or reload.

**System-wide installation (requires sudo)**

```fish
sudo cp scripts/completion/ccs.fish /usr/share/fish/vendor_completions.d/
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

### Fish: Completion not working

1. Check Fish version (3.0+ required):
   ```fish
   fish --version
   ```

2. Verify completion file is in the right location:
   ```fish
   ls ~/.config/fish/completions/ccs.fish
   ```

3. Verify jq is installed (required for profile completion):
   ```fish
   which jq
   ```

4. Test completion manually:
   ```fish
   complete -C'ccs '
   ```

5. If needed, rebuild completions:
   ```fish
   fish_update_completions
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

### Fish Implementation
- Uses declarative `complete` command
- Compatible with Fish 3.0+
- Automatic loading from `~/.config/fish/completions/`
- Helper functions for dynamic profile loading
- Context-aware using `__fish_seen_subcommand_from`
- No manual sourcing required

## Dependencies

- **jq**: Required for reading profiles from JSON files
  - Install: `brew install jq` (macOS) or `apt install jq` (Ubuntu)
  - Already required by CCS core functionality

## Contributing

When adding new commands or flags:
1. Update all four completion scripts (bash, zsh, fish, PowerShell)
2. Test on each shell
3. Update this README with new completion examples
4. Maintain cross-shell parity

## See Also

- [CCS Documentation](https://github.com/kaitranntt/ccs)
- [Bash Programmable Completion](https://www.gnu.org/software/bash/manual/html_node/Programmable-Completion.html)
- [Zsh Completion System](http://zsh.sourceforge.net/Doc/Release/Completion-System.html)
- [Fish Completion Tutorial](https://fishshell.com/docs/current/completions.html)
- [PowerShell Argument Completers](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/register-argumentcompleter)
