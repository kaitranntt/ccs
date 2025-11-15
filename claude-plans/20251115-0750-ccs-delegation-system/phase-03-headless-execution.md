# Phase 3: Headless Execution Engine

## Context Links

- **Parent Plan**: [plan.md](plan.md)
- **Dependencies**: Phase 2 (slash commands, subagent)
- **Research**: [researcher-02-architecture-analysis.md](research/researcher-02-architecture-analysis.md)

## Overview

**Date**: 2025-11-15
**Description**: Refine headless execution, CWD handling, result formatting
**Priority**: P1 (High - improves delegation reliability)
**Implementation Status**: ⏳ Not Started (blocked by Phase 2)
**Review Status**: ⏳ Awaiting User Review

## Key Insights

- Single-turn headless via `claude -p "prompt"` --settings flag
- CWD must be absolute path, resolved before delegation
- Result parsing extracts file changes automatically
- Formatted output shows complete source-of-truth

## Requirements

### Functional

1. **Headless Executor Module**
   - Spawn claude CLI with `-p` flag
   - Pass enhanced prompt
   - Use `--settings` for profile
   - Set CWD via spawn options
   - Capture stdout/stderr
   - Return structured result

2. **CWD Resolver**
   - Accept: raw prompt, current CWD
   - Parse prompt for path hints
   - Resolve to absolute path
   - Validate path exists

3. **Result Formatter**
   - Parse CLI output for file changes
   - Extract: created files, modified files, exit code
   - Format as structured report
   - Follow CCS output standards (ASCII only)

### Non-Functional

- <5s overhead for execution setup
- Graceful timeout handling (120s default)
- Clear error messages on failure
- Cross-platform compatible (Node.js/Bash/PowerShell)

## Architecture

```
bin/
└── delegation/
    ├── headless-executor.js         # NEW: Headless Claude spawner
    ├── cwd-resolver.js              # NEW: Path resolution logic
    └── result-formatter.js          # NEW: Output formatter
```

### Module: headless-executor.js

```javascript
const { spawn } = require('child_process');
const { detectClaudeCli } = require('../utils/claude-detector');

class HeadlessExecutor {
  static async execute(profile, enhancedPrompt, options = {}) {
    const { cwd, timeout = 120000 } = options;
    const claudeCli = detectClaudeCli();
    const settingsPath = `${process.env.HOME}/.ccs/profiles/${profile}/settings.json`;

    return new Promise((resolve, reject) => {
      const args = ['-p', enhancedPrompt, '--settings', settingsPath];

      const proc = spawn(claudeCli, args, {
        cwd: cwd || process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', data => stdout += data);
      proc.stderr.on('data', data => stderr += data);

      proc.on('close', code => {
        resolve({
          exitCode: code,
          stdout,
          stderr,
          cwd
        });
      });

      proc.on('error', reject);
    });
  }
}
```

### Module: cwd-resolver.js

```javascript
const path = require('path');
const fs = require('fs');

class CwdResolver {
  static resolve(prompt, currentCwd) {
    // Check for explicit path in prompt
    const pathMatch = prompt.match(/in\s+([\/\w\-\.]+)/);

    if (pathMatch) {
      const hintPath = pathMatch[1];
      const absolutePath = path.isAbsolute(hintPath)
        ? hintPath
        : path.resolve(currentCwd, hintPath);

      // Validate exists
      if (fs.existsSync(absolutePath)) {
        return absolutePath;
      }
    }

    // Default: use current CWD
    return currentCwd;
  }
}
```

### Module: result-formatter.js

```javascript
class ResultFormatter {
  static format(result, profile) {
    const { stdout, stderr, exitCode, cwd } = result;

    // Parse file changes from output
    const filesModified = this.extractFileChanges(stdout, 'modified');
    const filesCreated = this.extractFileChanges(stdout, 'created');

    // Build report
    let report = `\n[i] Delegated to ${profile.toUpperCase()}\n`;
    report += `╔${'═'.repeat(60)}╗\n`;
    report += `║ Working Directory: ${cwd.padEnd(44)} ║\n`;
    report += `║ Files Created: ${filesCreated.length.toString().padEnd(48)} ║\n`;
    report += `║ Files Modified: ${filesModified.length.toString().padEnd(47)} ║\n`;
    report += `║ Exit Code: ${exitCode.toString().padEnd(51)} ║\n`;
    report += `╚${'═'.repeat(60)}╝\n\n`;

    // Add output
    report += `${stdout}\n`;

    if (stderr) {
      report += `\n[!] Stderr:\n${stderr}\n`;
    }

    // Add file list
    if (filesCreated.length > 0) {
      report += `\n[i] Created Files:\n`;
      filesCreated.forEach(f => report += `  - ${f}\n`);
    }

    if (filesModified.length > 0) {
      report += `\n[i] Modified Files:\n`;
      filesModified.forEach(f => report += `  - ${f}\n`);
    }

    report += `\n[OK] Delegation completed\n`;

    return report;
  }

  static extractFileChanges(output, type) {
    // Parse patterns like "Created: path/to/file.js"
    const pattern = new RegExp(`${type}:\\s+(.+)`, 'gi');
    const matches = [...output.matchAll(pattern)];
    return matches.map(m => m[1].trim());
  }
}
```

## Related Code Files

**Existing Files to Modify**:
- `.claude/agents/ccs-delegator.md` (use new modules)

**New Files to Create**:
- `bin/delegation/headless-executor.js` (100 lines)
- `bin/delegation/cwd-resolver.js` (50 lines)
- `bin/delegation/result-formatter.js` (120 lines)

## Implementation Steps

1. **Create headless-executor.js**
   - Implement spawn logic
   - Add timeout handling
   - Add error handling
   - Test with simple prompts

2. **Create cwd-resolver.js**
   - Implement path hint parsing
   - Implement absolute path resolution
   - Add validation
   - Test with monorepo scenarios

3. **Create result-formatter.js**
   - Implement file change parsing
   - Implement ASCII box formatting
   - Add NO_COLOR support
   - Test output formatting

4. **Update ccs-delegator.md**
   - Use headless-executor instead of raw bash
   - Use cwd-resolver for path handling
   - Use result-formatter for output
   - Test full integration

5. **Cross-platform testing**
   - Test on macOS (Node.js)
   - Test on Linux (Node.js + Bash)
   - Test on Windows (Node.js + PowerShell)

## Todo List

- [ ] Create bin/delegation/headless-executor.js
- [ ] Create bin/delegation/cwd-resolver.js
- [ ] Create bin/delegation/result-formatter.js
- [ ] Update .claude/agents/ccs-delegator.md
- [ ] Test headless execution with GLM
- [ ] Test CWD resolution in monorepo
- [ ] Test result formatting
- [ ] Test timeout handling
- [ ] Test error scenarios
- [ ] Cross-platform testing (macOS/Linux/Windows)
- [ ] Add NO_COLOR support to formatter
- [ ] Write unit tests for all modules

## Success Criteria

- ✓ Headless execution completes successfully
- ✓ CWD resolver handles absolute/relative paths
- ✓ Result formatter shows all file changes
- ✓ ASCII box formatting renders correctly
- ✓ NO_COLOR environment variable respected
- ✓ Timeout handling works (120s default)
- ✓ Errors are caught and reported clearly
- ✓ Cross-platform compatibility verified
- ✓ File change detection accurate

## Risk Assessment

**MEDIUM RISK**: File change detection reliability

**Mitigation**:
- Use multiple parsing strategies
- Allow manual file list override
- Document expected output format

**LOW RISK**: CWD resolution (simple path logic)

## Security Considerations

1. **Path Traversal**
   - Validate resolved CWD within safe bounds
   - Reject paths outside project directory

2. **Command Injection**
   - Never interpolate user input into shell commands
   - Use spawn with array args (not shell mode)

3. **Output Sanitization**
   - Don't expose API keys in error messages
   - Sanitize file paths in output

## Next Steps

1. User approves headless execution design
2. Implement modules in parallel
3. Integration test with Phase 2 slash commands
4. Cross-platform validation
5. Move to Phase 4 (custom model support)
