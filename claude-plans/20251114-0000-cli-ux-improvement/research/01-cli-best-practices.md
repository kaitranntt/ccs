# Modern CLI UI/UX Best Practices Research Report

**Research Date:** 2025-11-14
**Focus:** Developer-focused CLI tools (gh, npm, cargo, docker, kubectl)

## Executive Summary

Modern CLIs must balance traditional UNIX principles with contemporary UX expectations. Key evolution: CLIs now serve developers who expect responsive, human-friendly interfaces with clear feedback, not just composable pipes.

## Core UX Principles

### 1. Human-First Design (clig.dev)
- **If used primarily by humans, design for humans first**
- Provide clear, actionable error messages with suggestions
- Make functionality discoverable through intuitive commands
- Support conversational interaction patterns

### 2. Composability & Robustness
- Maintain UNIX philosophy: small programs with clean interfaces
- Never break stdout parsing with decorative elements (table borders)
- Each output row = single data entry
- Preserve backward compatibility

### 3. Empathy & Context
- Show users what went wrong AND how to fix it
- Suggest similar commands on typos (Git pattern)
- Include version info in error messages for debugging
- Provide trackable error codes for documentation lookup

## 1. Error Messaging Patterns

### Best Practices

**Structure:**
```
[ERROR] Clear description of what went wrong
  Context: What was being attempted
  Reason: Why it failed

  Suggestions:
    - Try: <actionable fix>
    - Or: <alternative approach>

  Error Code: E123 (https://docs.example.com/errors/E123)
```

**Key Principles:**
- **Actionability:** Every error should suggest next steps
- **Clarity:** Use plain language, not technical jargon
- **Context:** Include relevant values/paths that caused the issue
- **Exit codes:** Non-zero for errors, consistent across runs

**Stream Usage:**
- stdout: Actual program output, intended for piping
- stderr: Errors, warnings, logs, prompts, diagnostics
- Help requested via `--help`: stdout (exit 0)
- Help shown due to error: stderr (exit 1+)

### Anti-Patterns to Avoid

- ❌ Vague messages: "Error: Failed" (what failed? why? how to fix?)
- ❌ Stack traces without context for end users
- ❌ Errors without exit codes or reference documentation
- ❌ Missing version information in error output
- ❌ Confusing stdout/stderr (sends errors to stdout)

## 2. Progress Indicators & Feedback

### Never Leave Users Staring at Blinking Cursors

**Timing Rules:**
- < 1 second: No indicator needed
- 2-10 seconds: Spinner (indeterminate)
- 10+ seconds: Progress bar (determinate)

### Three Core Patterns

**Pattern 1: Spinners (Indeterminate)**
```
[⠋] Processing files...
```
- Update on meaningful events (per-file completion)
- Shows liveness, prevents "frozen" perception
- Use when total work is unknown

**Pattern 2: X of Y (Step Counter)**
```
[3/10] Installing dependencies...
```
- Best for discrete, countable steps
- Allows users to estimate remaining time
- Shows progress vs. stuck detection

**Pattern 3: Progress Bars (Determinate)**
```
[████████░░░░░░░░] 45% Downloading packages (23.4 MB/52 MB)
```
- Most informative for long operations
- Show: current %, completed/total units
- Update frequently (but not faster than ~10Hz)

### Implementation Notes
- Test in different terminal sizes (80, 120, 200 cols)
- Degrade gracefully when TTY detection fails
- Clear progress indicator before final output
- Show elapsed time for operations >30 seconds

## 3. Output Formatting & Readability

### General Standards

**Default Output (Human-Readable):**
- Aligned columns with padding
- Clear headers and sections
- Status indicators: [OK], [!], [X], [i]
- Whitespace for visual grouping

**Machine-Readable Modes:**
- `--json`: Structured JSON output
- `--quiet`: Minimal/no output
- `--format`: Custom templates (table/compact/json/yaml)

### Table Borders: The Great Debate
- **Never use decorative borders in default output** (breaks parsing)
- Tables for humans should use simple column alignment
- Reserve bordered tables for explicit `--format=table` flags

### Color Guidelines
- Semantic colors only: red=error, yellow=warning, green=success
- Check TTY: `isatty(1)` or `Deno.stdout.isTerminal()`
- Respect NO_COLOR environment variable
- Provide `--no-color` flag for explicit control
- Default to no color when piped or redirected

## 4. Help Text Organization

### Structure (from clap/rust patterns)

```
USAGE:
    command [OPTIONS] <REQUIRED_ARG> [OPTIONAL_ARG]

ARGS:
    <REQUIRED_ARG>    Description of what this does

OPTIONS:
    -h, --help              Print help information
    -V, --version           Print version information
    -v, --verbose           Enable verbose output
    -f, --file <FILE>       Path to input file
        --config <PATH>     Custom config location [default: ~/.config/app]

EXAMPLES:
    Simple usage:
        $ command input.txt

    With options:
        $ command --verbose --file data.json input.txt

    For more: https://docs.example.com
```

**Key Elements:**
1. Usage syntax at top (one-liner)
2. Args section (required positional)
3. Options section (flags, optional)
4. Examples section (critical!)
5. Links to full documentation

**Text Wrapping:**
- Enable auto-wrap for help text (80-120 cols)
- Indent continuation lines consistently
- Use custom headings to group related options

### Documentation Levels
- `-h`: Brief help (fits one screen)
- `--help`: Detailed help with examples
- `man command`: Full manual page

## 5. Interactive Prompts & Confirmations

### Core Principles

**Safety First:**
```
Are you sure you want to delete 47 files? [y/N]:
```
- Default to SAFE option (N for destructive actions)
- Destructive = file deletion, data modification, system changes
- Use `initial: false` for these prompts

**Non-Destructive Actions:**
```
Continue installation? [Y/n]:
```
- Default to affirmative (Y) for safe operations

### Best Practices

**Validation:**
- Validate input immediately, provide clear error messages
- Prevent "redo entire process" scenarios
- Show constraints upfront: "Enter number between 1-10:"

**Bypass Mechanisms:**
```bash
--yes, -y          # Auto-confirm all prompts
--no-input         # Fail if interaction required (CI/automation)
--force, -f        # Override safety checks (dangerous operations)
```

**Golden Rule:**
- Interactive mode ≠ replacement for non-interactive
- Always provide flag-based alternatives
- Scripts and automation depend on non-interactive modes

## 6. Command Structure & Discoverability

### Modern Patterns (kubectl, docker, gh)

**Hierarchical Commands:**
```
kubectl get pods              # resource-based
docker container ls           # noun-verb structure
gh pr create                  # object-action pattern
```

**Common Structures:**
- `command [global-opts] <resource> <action> [opts] [args]`
- `command <noun> <verb> [opts] [args]`
- Both improve discoverability through logical grouping

### Discoverability Features

**Did-you-mean Suggestions:**
```
Error: Unknown command 'pul'
Did you mean: pull, push?
```

**List Available Commands:**
```
$ command --help
Available commands:
    init      Initialize new project
    build     Build application
    deploy    Deploy to production
```

**Abbreviations & Aliases:**
- Support common abbreviations: `ps` for `persistentvolumeclaims`
- Document in help text: `pods (alias: po)`

## 7. Cross-Platform Consistency

### Critical Differences

**Path Separators:**
- Linux/macOS: `/path/to/file`
- Windows: `C:\path\to\file` (but also accepts `/`)
- **Solution:** Use platform-aware path libraries

**Shell Chaining:**
- Linux/macOS: `cmd1; cmd2` and `cmd1 && cmd2`
- Windows CMD: Same, but different error handling
- **Solution:** Use language-native process spawning

**Line Endings:**
- Linux/macOS: LF (`\n`)
- Windows: CRLF (`\r\n`)
- **Solution:** Let language handle, or use .gitattributes

### Best Practices

**Language Choices:**
- Go: Excellent cross-platform support, static binaries
- Node.js: Universal runtime, path/process modules
- Rust: Strong cross-platform, but binary per platform
- Bash/PowerShell: Write both for full parity

**Testing Matrix:**
- macOS (bash/zsh)
- Linux (bash)
- Windows (PowerShell + Git Bash)

## Key Anti-Patterns to Avoid

1. **Silent Failures:** Always output to stderr on errors
2. **Emoji in Output:** Breaks terminal compatibility, parser fragility
3. **Unbounded Operations:** No progress feedback for long tasks
4. **Parsing stdout for Logic:** Reserve stdout for data only
5. **Forcing Interaction:** No `--yes`/`--no-input` flags
6. **Inconsistent Exit Codes:** 0=success, non-zero=failure (be specific)
7. **Missing Examples:** Help text without usage examples
8. **Platform Assumptions:** Hardcoded paths, shell-specific syntax

## Top Recommendations for Developer CLIs

### Priority 1: Foundational
- ✓ Respect stdout/stderr separation strictly
- ✓ Implement TTY detection + NO_COLOR support
- ✓ Non-zero exit codes for all error conditions
- ✓ Clear error messages with suggested fixes

### Priority 2: User Experience
- ✓ Progress indicators for operations >2 seconds
- ✓ Examples in help text (not just flag descriptions)
- ✓ Did-you-mean suggestions for typos
- ✓ `--json` output mode for scripting

### Priority 3: Polish
- ✓ Interactive prompts with `--yes` bypass
- ✓ Semantic color usage (when TTY detected)
- ✓ Version info in error messages
- ✓ Error codes linking to documentation

## References & Resources

- **clig.dev** - CLI Guidelines (open-source, modern UNIX principles)
- **12 Factor CLI Apps** - Specific patterns for CLI design
- **NO_COLOR Standard** - Cross-tool color disabling convention
- **Node.js CLI Best Practices** - github.com/lirantal/nodejs-cli-apps-best-practices
- **Evil Martians Blog** - CLI UX progress display patterns
- **clap (Rust)** - Modern help text formatting patterns

---

**Lines:** 148/150 limit
