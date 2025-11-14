# Phase 2: Progress Feedback & Indicators

## Context

**Parent Plan:** [CLI UI/UX Improvement Plan](plan.md)
**Dependencies:** Phase 1 (error codes for timeout errors)
**Documentation:** [CLI Best Practices](research/01-cli-best-practices.md)

## Overview

**Date Created:** 2025-11-14
**Description:** Add visual progress feedback for long-running operations
**Priority:** P1 (Medium Impact, Medium Effort)
**Implementation Status:** Not Started
**Review Status:** Pending

## Key Insights

**User Pain Points:**
- GLMT proxy startup: 5s silent wait (users think it's frozen)
- Doctor command: Sequential checks with no progress indication
- Long operations: No way to know if CCS is working or stuck

**Research Findings:**
- Operations >2s need feedback (spinner minimum)
- Operations >10s need progress bars
- Update on meaningful events, not just time
- Degrade gracefully when TTY not available

## Requirements

### Must Have
1. GLMT proxy startup spinner (bin/ccs.js:246-270)
2. Doctor command progress indicators (lib/ccs:187-298)
3. TTY detection (no spinners in pipes/logs)
4. Cross-platform support (bash/PowerShell/Node.js)

### Should Have
5. Elapsed time display for long operations (>30s)
6. Operation cancellation hint (Ctrl+C)
7. Graceful degradation (no ANSI when TTY=false)

### Could Have
8. Progress bars for file operations
9. Step counters ([3/10] Installing...)
10. Estimated time remaining

## Architecture

### Progress Indicator Library

**Constraint:** NO external dependencies (YAGNI, KISS)

**Implementation:** Simple ANSI spinner using \r (carriage return)

**Node.js (bin/utils/progress-indicator.js):**
```javascript
class ProgressIndicator {
  constructor(message, options = {}) {
    this.message = message;
    this.frames = options.frames || ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.frameIndex = 0;
    this.interval = null;
    this.startTime = Date.now();
    this.isTTY = process.stderr.isTTY && !process.env.CI;
  }

  start() {
    if (!this.isTTY) {
      // Non-TTY: just print message once
      process.stderr.write(`[i] ${this.message}...\n`);
      return;
    }

    // TTY: animate spinner
    this.interval = setInterval(() => {
      const frame = this.frames[this.frameIndex];
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      process.stderr.write(`\r[${frame}] ${this.message}... (${elapsed}s)`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80); // 12.5fps
  }

  succeed(message) {
    this.stop();
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stderr.write(`\r[OK] ${message || this.message} (${elapsed}s)\n`);
  }

  fail(message) {
    this.stop();
    process.stderr.write(`\r[X] ${message || this.message}\n`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

module.exports = { ProgressIndicator };
```

**bash (lib/progress-indicator.sh):**
```bash
# Simple spinner for bash (no Unicode in CI/non-TTY)
show_spinner() {
  local message="$1"
  local pid="$2"

  # Check TTY
  if [[ ! -t 2 ]] || [[ -n "${CI:-}" ]]; then
    echo "[i] $message..." >&2
    return
  fi

  local frames=('|' '/' '-' '\\')
  local frame_idx=0
  local start_time=$(date +%s)

  while kill -0 "$pid" 2>/dev/null; do
    local frame="${frames[$frame_idx]}"
    local elapsed=$(($(date +%s) - start_time))
    printf "\r[%s] %s... (%ds)" "$frame" "$message" "$elapsed" >&2
    frame_idx=$(( (frame_idx + 1) % 4 ))
    sleep 0.1
  done

  # Clear line
  printf "\r\033[K" >&2
}
```

**PowerShell (lib/progress-indicator.ps1):**
```powershell
function Show-Progress {
    param(
        [string]$Message,
        [scriptblock]$Task
    )

    $IsTTY = -not [Console]::IsOutputRedirected -and -not $env:CI

    if (-not $IsTTY) {
        Write-Host "[i] $Message..." -ForegroundColor Gray
        & $Task
        return
    }

    # Spinner frames
    $Frames = @('|', '/', '-', '\')
    $FrameIndex = 0
    $StartTime = Get-Date

    # Run task in background
    $Job = Start-Job -ScriptBlock $Task

    # Animate spinner
    while ($Job.State -eq 'Running') {
        $Frame = $Frames[$FrameIndex]
        $Elapsed = [math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)
        Write-Host "`r[$Frame] $Message... ($($Elapsed)s)" -NoNewline -ForegroundColor Cyan
        $FrameIndex = ($FrameIndex + 1) % $Frames.Length
        Start-Sleep -Milliseconds 100
    }

    # Clear line
    Write-Host "`r$(' ' * 80)`r" -NoNewline

    # Get result
    $Result = Receive-Job -Job $Job
    Remove-Job -Job $Job

    return $Result
}
```

### Integration Points

#### 1. GLMT Proxy Startup (bin/ccs.js:218-342)

**Current:**
```javascript
// Silent wait for 5 seconds
port = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('Proxy startup timeout (5s)'));
  }, 5000);
  // ...
});
```

**Enhanced:**
```javascript
const { ProgressIndicator } = require('./utils/progress-indicator');

const spinner = new ProgressIndicator('Starting GLMT proxy');
spinner.start();

try {
  port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Proxy startup timeout (5s)'));
    }, 5000);

    proxy.stdout.on('data', (data) => {
      const match = data.toString().match(/PROXY_READY:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(parseInt(match[1]));
      }
    });

    proxy.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  spinner.succeed(`GLMT proxy ready (port ${port})`);
} catch (error) {
  spinner.fail('GLMT proxy startup failed');
  // ... existing error handling ...
}
```

#### 2. Doctor Command (lib/ccs:187-298)

**Current:**
```bash
doctor_run() {
  echo -e "${CYAN}Running CCS Health Check...${RESET}"
  echo ""

  doctor_check "Claude CLI" "success"  # Immediate output
  doctor_check "CCS Directory" "success"
  # ... etc
}
```

**Enhanced:**
```bash
doctor_run() {
  echo -e "${CYAN}Running CCS Health Check...${RESET}"
  echo ""

  # Show progress during checks
  local total_checks=8
  local current_check=0

  run_check() {
    current_check=$((current_check + 1))
    local name="$1"
    local check_fn="$2"

    # TTY: show progress counter
    if [[ -t 2 ]]; then
      printf "\r[%d/%d] Checking: %s..." "$current_check" "$total_checks" "$name" >&2
    fi

    # Run check
    local result=$($check_fn)

    # TTY: clear progress line
    if [[ -t 2 ]]; then
      printf "\r\033[K" >&2
    fi

    # Show result
    doctor_check "$name" "$result"
  }

  run_check "Claude CLI" check_claude_cli
  run_check "CCS Directory" check_ccs_directory
  # ... etc

  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════${RESET}"
  # ... summary ...
}
```

#### 3. Profile Creation (lib/ccs:754-815)

**Current:**
```bash
auth_create() {
  # ... validation ...

  echo "[i] Creating profile: $profile_name"
  local instance_path=$(ensure_instance "$profile_name")
  echo "[i] Instance directory: $instance_path"
  echo ""

  register_profile "$profile_name"

  echo -e "${YELLOW}[i] Starting Claude in isolated instance...${RESET}"
  # ... launch Claude ...
}
```

**Enhanced:**
```bash
auth_create() {
  # ... validation ...

  # Show spinner during instance creation (if slow)
  local instance_path
  if [[ -t 2 ]]; then
    instance_path=$(ensure_instance "$profile_name" &)
    local pid=$!
    show_spinner "Creating profile instance" "$pid"
    wait "$pid"
  else
    echo "[i] Creating profile: $profile_name"
    instance_path=$(ensure_instance "$profile_name")
  fi

  echo "[i] Instance directory: $instance_path"
  echo ""

  register_profile "$profile_name"

  echo -e "${YELLOW}[i] Starting Claude in isolated instance...${RESET}"
  # ... launch Claude ...
}
```

## Related Code Files

### Node.js
- **NEW:** `bin/utils/progress-indicator.js` - Progress spinner class
- `bin/ccs.js` L218-342: execClaudeWithProxy() - add spinner
- `bin/management/doctor.js`: Add progress indicators

### Bash
- **NEW:** `lib/progress-indicator.sh` - Bash spinner functions
- `lib/ccs` L187-298: doctor_run() - add progress display
- `lib/ccs` L754-815: auth_create() - add spinner

### PowerShell
- **NEW:** `lib/progress-indicator.ps1` - PowerShell progress functions
- `lib/ccs.ps1`: Similar enhancements to bash

## Implementation Steps

### Step 1: Create Progress Indicator Utilities (Day 1, 4h)
1. Create `bin/utils/progress-indicator.js` with ProgressIndicator class
2. Create `lib/progress-indicator.sh` with bash functions
3. Create `lib/progress-indicator.ps1` with PowerShell functions
4. Test TTY detection and graceful degradation

### Step 2: GLMT Proxy Spinner (Day 1, 2h)
1. Update `bin/ccs.js` execClaudeWithProxy()
2. Add spinner start before proxy spawn
3. Add spinner succeed/fail based on proxy readiness
4. Test with --verbose flag (ensure spinner doesn't interfere)

### Step 3: Doctor Command Progress (Day 2, 3h)
1. Update bash doctor_run() with progress counter
2. Update PowerShell doctor implementation
3. Update Node.js doctor.js (if exists)
4. Test sequential check display

### Step 4: Profile Creation Spinner (Day 2, 2h)
1. Update bash auth_create() with spinner
2. Update PowerShell auth implementation
3. Test on slow file systems

### Step 5: Testing (Day 2-3, 3h)
1. Test TTY vs non-TTY behavior
2. Test with CI=true environment
3. Test piped output (no ANSI escape codes)
4. Test cancellation (Ctrl+C)
5. Test on macOS/Linux/Windows

### Step 6: Documentation (Day 3, 1h)
1. Update README with new progress feedback
2. Add CHANGELOG entry
3. Document TTY detection behavior

## Todo List

- [ ] Create progress indicator utilities (JS/bash/PowerShell)
- [ ] Add GLMT proxy startup spinner
- [ ] Add doctor command progress display
- [ ] Add profile creation spinner (optional)
- [ ] Test TTY detection and graceful degradation
- [ ] Test with piped output (ensure no ANSI)
- [ ] Test cancellation behavior (Ctrl+C)
- [ ] Manual testing on macOS/Linux/Windows
- [ ] Update documentation
- [ ] Code review and merge

## Success Criteria

### Functional
- [ ] GLMT proxy shows spinner during startup
- [ ] Doctor command shows progress during checks
- [ ] No spinners when output is piped
- [ ] No spinners when CI=true
- [ ] Ctrl+C cancels operations cleanly

### Quality
- [ ] Cross-platform consistency (bash/PowerShell/Node.js)
- [ ] No ANSI codes in non-TTY output
- [ ] No performance regression
- [ ] Clean code (no external dependencies)

### User Experience
- [ ] Users see immediate feedback (no "frozen" perception)
- [ ] Elapsed time visible for operations >5s
- [ ] Clear success/failure indication
- [ ] Spinner doesn't interfere with verbose output

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|:-----|:-----------|:-------|:-----------|
| ANSI codes in logs | Medium | Medium | Strict TTY detection, CI env check |
| Spinner flicker | Low | Low | Use stderr, proper \r handling |
| Performance overhead | Low | Low | Minimal (80ms interval) |
| Windows rendering issues | Medium | Low | Test PowerShell thoroughly |

## Security Considerations

1. **No sensitive data in spinner messages**
2. **Validate elapsed time calculations** (no overflow)
3. **Handle malicious terminal responses** (unlikely but possible)

## Next Steps

1. Create progress indicator utilities
2. Integrate GLMT proxy spinner
3. Enhance doctor command
4. Test across platforms
5. Deploy and monitor user feedback

---

**Estimated Effort:** 2-3 days
**Blocking Issues:** None
**Ready for Implementation:** After Phase 1 (error codes)
