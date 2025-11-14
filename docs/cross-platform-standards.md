# Cross-Platform Standards

**Updated:** 2025-11-14
**Applies to:** bash (lib/ccs), PowerShell (lib/ccs.ps1), Node.js (bin/ccs.js)

## Error Message Formatting

### Standardized Error Box (bash, PowerShell)

**Format:** ASCII-only (no Unicode box drawing characters)

```
=============================================
  ERROR
=============================================

{Error message text}

```

**Implementation:**
- **Bash** (`lib/ccs`): `msg_error()` - Uses `=============` with ANSI colors
- **PowerShell** (`lib/ccs.ps1`): `Write-ErrorMsg()` - Uses `=============` with colored output
- **Node.js** (`bin/utils/error-manager.js`): No error box - Uses `[X]` prefix for consistency with Claude CLI style

### Error Message Components

All error messages should include:
1. **Error indicator**: `[X]` prefix
2. **Short description**: What went wrong
3. **Context** (optional): File paths, values, etc.
4. **Solutions section**: Actionable steps to resolve
5. **Error code & URL**: For detailed documentation

### Color Standards

**TTY Detection:**
- Only use colors when output is to a TTY
- Respect `NO_COLOR` environment variable
- Respect `FORCE_COLOR` environment variable
- Disable colors in CI environments

**Color Palette:**
- Red: Errors, critical warnings
- Yellow: Warnings, suggestions, command examples
- Green: Success messages
- Cyan: Section headers, info
- Bold: Emphasis

**Implementation:**
- **Bash**: ANSI escape codes with `setup_colors()` function
- **PowerShell**: `Write-Host -ForegroundColor`
- **Node.js**: `helpers.colored()` function

## Help Text Standards

### Required Sections (in order)

1. **Title & Description**
2. **Usage**
3. **Description**
4. **Model Switching** (main help only)
5. **Account Management**
6. **Diagnostics**
7. **Flags**
8. **Configuration**
9. **Shared Data**
10. **Examples**
11. **Documentation**
12. **License**

### Formatting Rules

- Section headers: Cyan color
- Commands: Yellow color
- Comments: Plain text or gray
- Use 2-space indentation for nested items
- Align command descriptions for readability

### Cross-Platform Differences (Acceptable)

**Bash:**
- Uses `\$` for shell prompt examples
- Uses ANSI color codes via echo -e
- Examples section at bottom

**PowerShell:**
- Uses backtick for escape sequences
- Uses Write-Host with -ForegroundColor
- Examples section integrated differently

**Node.js:**
- Uses console.log with colored() helper
- Similar structure to bash

## Output Format Standards

### Human-Readable Output

- Use ANSI colors when TTY available
- Clear hierarchical structure
- Empty lines between sections
- Indicators: `[*]` (default), `[ ]` (not default), `[X]` (error), `[OK]` (success), `[i]` (info)

### JSON Output (`--json` flag)

**Schema:**
```json
{
  "version": "{CCS_VERSION}",
  "profiles": [ /* array of profile objects */ ]
}
```

**Standards:**
- Use actual CCS version (from package.json)
- Consistent field naming: snake_case
- `null` for missing optional fields
- ISO 8601 timestamps
- 2-space indentation
- UTF-8 encoding

## Testing Standards

### Manual Cross-Platform Testing

Test on all three platforms:
- macOS (bash)
- Linux (bash)
- Windows (PowerShell + Git Bash)

### Key Test Scenarios

1. **Error messages**: Consistent formatting across platforms
2. **Help text**: No broken formatting, colors work
3. **JSON output**: Valid JSON, identical schema
4. **TTY detection**: Colors only when appropriate
5. **Interactive prompts**: Work correctly, respect --yes flag

### Automation

Run on each platform:
```bash
# Bash
./tests/edge-cases.sh

# PowerShell
./tests/edge-cases.ps1

# Node.js
npm test
```

## Implementation Checklist

When adding new features:
- [ ] Implement in all 3 platforms (bash, PowerShell, Node.js)
- [ ] Use ASCII-only characters (no Unicode unless necessary)
- [ ] Add TTY detection for colors
- [ ] Update --help text in all 3 platforms
- [ ] Test on macOS/Linux/Windows
- [ ] Ensure error messages follow standards
- [ ] Add to edge-cases tests if applicable

## Known Platform Differences (Not Bugs)

1. **Path separators**: `/` (Unix) vs `\` (Windows)
2. **Line endings**: LF (Unix) vs CRLF (Windows)
3. **Color rendering**: May vary by terminal emulator
4. **Shell syntax**: Bash vs PowerShell command examples
5. **Date formatting**: May vary by locale

These differences are expected and acceptable.

## Parity Enforcement

**Philosophy:** Cross-platform parity means identical functionality and user experience, not identical code.

**What must be identical:**
- Command names and options
- Error messages (content)
- JSON schema
- Feature availability
- Default behavior

**What can differ:**
- Implementation details
- Shell-specific examples in help text
- Internal function names
- File handling (paths, line endings)

---

**See Also:**
- [Development Rules](../workflows/development-rules.md)
- [CLAUDE.md](../CLAUDE.md)
- [Error Codes](error-codes.md)
