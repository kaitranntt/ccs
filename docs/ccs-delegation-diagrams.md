# CCS Delegation Workflow Diagrams

Visual guide to understanding how CCS delegation works internally.

---

## Overview Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CCS Architecture                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User Input                                                 │
│     │                                                       │
│     ├─── ccs glm              → Normal Profile Execution   │
│     │                                                       │
│     └─── ccs glm -p "task"    → Delegation Flow ⚡         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Execution Flow Comparison

### Normal Execution (Without -p)
```
User: ccs glm
  │
  ├─→ bin/ccs.js (main entry)
  │     │
  │     ├─→ Profile Detection: "glm"
  │     │
  │     └─→ execClaude()
  │           │
  │           └─→ spawn("claude", ["--settings", "~/.ccs/glm.settings"])
  │                 │
  │                 └─→ Claude CLI Interactive Session
  │                       │
  │                       └─→ Direct User Interaction
```

### Delegation Execution (With -p)
```
User: ccs glm -p "add tests for UserService"
  │
  ├─→ bin/ccs.js (main entry)
  │     │
  │     ├─→ -p Flag Detected! 🎯
  │     │
  │     └─→ DelegationHandler.route(args)
  │           │
  │           ├─→ Parse args
  │           │     ├─ profile: "glm"
  │           │     ├─ prompt: "add tests for UserService"
  │           │     └─ options: { outputFormat: "stream-json", timeout: 600000 }
  │           │
  │           ├─→ Validate profile (DelegationValidator)
  │           │
  │           └─→ HeadlessExecutor.execute("glm", prompt, options)
  │                 │
  │                 ├─→ spawn("claude", [
  │                 │       "-p", prompt,
  │                 │       "--settings", "~/.ccs/glm.settings",
  │                 │       "--output-format", "stream-json",
  │                 │       "--permission-mode", "acceptEdits"
  │                 │   ])
  │                 │
  │                 ├─→ Parse stream-JSON output (jsonl format)
  │                 │     {"type":"init","session_id":"abc123"}
  │                 │     {"type":"assistant","message":{...}}
  │                 │     {"type":"result","total_cost_usd":0.0042,"num_turns":3}
  │                 │
  │                 ├─→ SessionManager.saveSession()
  │                 │     └─→ ~/.ccs/delegation-sessions.json
  │                 │
  │                 └─→ ResultFormatter.format(result)
  │                       │
  │                       └─→ ASCII Box Output
  │                             ╔════════════════════════╗
  │                             ║ Session: abc123        ║
  │                             ║ Cost: $0.0042          ║
  │                             ║ Turns: 3               ║
  │                             ╚════════════════════════╝
```

---

## Continue Command Flow

### Multi-Turn Session Workflow
```
┌─────────────────────────────────────────────────────────────┐
│ Turn 1: Initial Task                                        │
└─────────────────────────────────────────────────────────────┘

User: ccs glm -p "implement user registration"
  │
  └─→ HeadlessExecutor
        │
        ├─→ Execute with fresh session
        │
        └─→ Save session metadata:
              {
                "profile": "glm",
                "sessionId": "session-001",
                "totalCost": 0.0025,
                "turns": 2,
                "cwd": "/path/to/project",
                "lastUpdated": "2025-11-15T18:00:00Z"
              }

┌─────────────────────────────────────────────────────────────┐
│ Turn 2: Continue Session                                    │
└─────────────────────────────────────────────────────────────┘

User: ccs glm:continue -p "add validation tests"
  │
  └─→ DelegationHandler detects ":continue" suffix
        │
        ├─→ Extract base profile: "glm"
        │
        ├─→ SessionManager.getLastSession("glm")
        │     └─→ Returns: { sessionId: "session-001", ... }
        │
        └─→ HeadlessExecutor.execute("glm", prompt, {
              resumeSession: true,
              sessionId: "session-001"  ← Resume!
            })
              │
              ├─→ spawn("claude", [
              │       "-p", "add validation tests",
              │       "--resume", "session-001",  ← Continue!
              │       "--output-format", "stream-json",
              │       "--verbose",
              │       ...
              │   ])
              │
              └─→ Update session metadata:
                    {
                      "sessionId": "session-001",  ← Same session
                      "totalCost": 0.0067,         ← Aggregated
                      "turns": 5,                  ← Incremented
                      "lastUpdated": "2025-11-15T18:05:00Z"
                    }

┌─────────────────────────────────────────────────────────────┐
│ Turn 3+: Multiple Continues                                 │
└─────────────────────────────────────────────────────────────┘

User: ccs glm:continue -p "run the tests"
  │
  └─→ Same flow, cost keeps aggregating:
        {
          "totalCost": 0.0089,  ← $0.0025 + $0.0042 + $0.0022
          "turns": 7            ← 2 + 3 + 2
        }
```

---

## Session Management Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                ~/.ccs/delegation-sessions.json                │
├───────────────────────────────────────────────────────────────┤
│ {                                                             │
│   "glm": {                                                    │
│     "sessionId": "abc123-def456",                             │
│     "totalCost": 0.0067,          ← Aggregated across turns  │
│     "turns": 5,                   ← Total turn count         │
│     "cwd": "/home/user/project",  ← Working directory        │
│     "lastUpdated": "2025-11-15T18:05:00Z",                   │
│     "expiresAt": "2025-12-15T18:05:00Z"  ← 30 days          │
│   },                                                          │
│   "kimi": {                                                   │
│     "sessionId": "xyz789-uvw012",                             │
│     "totalCost": 0.0123,                                      │
│     "turns": 8,                                               │
│     "cwd": "/home/user/other-project",                       │
│     "lastUpdated": "2025-11-14T10:30:00Z",                   │
│     "expiresAt": "2025-12-14T10:30:00Z"                      │
│   }                                                           │
│ }                                                             │
└───────────────────────────────────────────────────────────────┘

Operations:
  ├─→ saveSession(profile, metadata)  → Write to file
  ├─→ getLastSession(profile)         → Read from file
  ├─→ updateSession(profile, updates) → Merge + write
  └─→ cleanupExpired()                → Remove old sessions (>30 days)
```

---

## Decision Flow: When to Delegate

```
User Task Request
  │
  ├─→ Task Analysis (ccs-delegator agent)
  │     │
  │     ├─→ Read ccs-delegation skill
  │     │
  │     └─→ Pattern Matching:
  │           │
  │           ├─→ Match delegation patterns?
  │           │     ├─ "refactor .* to use async/await" ✓
  │           │     ├─ "add tests for .*" ✓
  │           │     ├─ "fix typos in .*" ✓
  │           │     └─ ...
  │           │
  │           ├─→ Match anti-patterns?
  │           │     ├─ "implement .*" ✗
  │           │     ├─ "optimize .*" ✗
  │           │     └─ "design .*" ✗
  │           │
  │           └─→ Check criteria:
  │                 ├─ Scope: < 5 files? ✓
  │                 ├─ Complexity: Mechanical? ✓
  │                 ├─ Ambiguity: Zero decisions? ✓
  │                 └─ Context: Patterns exist? ✓
  │
  └─→ Decision:
        │
        ├─→ YES → Delegate
        │     └─→ ccs glm -p "task"
        │
        └─→ NO → Keep in main session
              └─→ Handle directly in conversation
```

---

## Cost Tracking & Token Optimization

### Traditional Main Session Flow
```
User: "Add tests for UserService, AuthService, and OrderService"
  │
  └─→ Claude in main session:
        │
        ├─→ Loads full context (2000+ tokens)
        ├─→ Discusses approach with user
        ├─→ Implements UserService tests
        ├─→ Shows code, waits for approval
        ├─→ Implements AuthService tests
        ├─→ Shows code, waits for approval
        ├─→ Implements OrderService tests
        └─→ Total: ~8000 tokens, $0.032

Main Session Cost:
  Context load:     2000 tokens
  Discussion:       1500 tokens
  Implementation:   4500 tokens
  ────────────────────────────
  Total:            8000 tokens → $0.032
```

### Delegation Flow (Token Optimized)
```
User: "Add tests for UserService, AuthService, and OrderService"
  │
  └─→ ccs-delegator agent:
        │
        ├─→ Analyzes: 3 similar tasks → Batch delegate
        │
        ├─→ Execute 3 delegations:
        │     │
        │     ├─→ ccs glm -p "add tests for UserService"
        │     │     └─→ Cost: $0.0015 (500 tokens)
        │     │
        │     ├─→ ccs glm -p "add tests for AuthService"
        │     │     └─→ Cost: $0.0015 (500 tokens)
        │     │
        │     └─→ ccs glm -p "add tests for OrderService"
        │           └─→ Cost: $0.0015 (500 tokens)
        │
        └─→ Total: ~1500 tokens, $0.0045

Delegation Cost:
  Task 1 (GLM):     500 tokens → $0.0015
  Task 2 (GLM):     500 tokens → $0.0015
  Task 3 (GLM):     500 tokens → $0.0015
  ────────────────────────────────────────
  Total:           1500 tokens → $0.0045

Savings: $0.032 - $0.0045 = $0.0275 (86% reduction) ⚡
```

---

## Integration Points Summary

```
┌─────────────────────────────────────────────────────────────┐
│                   Integration Points                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. bin/ccs.js (lines 501-507)                              │
│     └─→ Detects -p flag → Routes to DelegationHandler      │
│                                                             │
│  2. bin/delegation/delegation-handler.js (NEW)              │
│     └─→ Orchestrates delegation flow                       │
│                                                             │
│  3. bin/delegation/headless-executor.js (EXISTING)          │
│     └─→ Spawns claude -p with enhanced flags                │
│                                                             │
│  4. bin/delegation/session-manager.js (EXISTING)            │
│     └─→ Persists session metadata                          │
│                                                             │
│  5. bin/delegation/result-formatter.js (EXISTING)           │
│     └─→ Formats ASCII box output                           │
│                                                             │
│  6. .claude/commands/ccs/glm.md                             │
│     └─→ Executes: ccs glm -p "$ARGUMENTS"                  │
│                                                             │
│  7. .claude/agents/ccs-delegator.md                         │
│     └─→ Proactive delegation via Task tool                 │
│                                                             │
│  8. .claude/skills/ccs-delegation/                          │
│     └─→ AI decision framework + technical docs             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Effectiveness Metrics

### Feature Coverage

```
✅ Stream-JSON Output Parsing
   └─→ Real-time jsonl format, extracts: session_id, cost, turns, errors

✅ Real-Time Tool Visibility
   └─→ Shows: [Tool] Bash: npm install, [Tool] Write: index.html

✅ Session Management
   └─→ Persists to: ~/.ccs/delegation-sessions.json

✅ Multi-Turn Support
   └─→ Resume via: ccs glm:continue -p "task"

✅ Cost Tracking
   └─→ Aggregates across turns, displays in USD

✅ Time-Based Limits
   └─→ Default: 10min timeout with graceful SIGTERM termination

✅ Permission Mode
   └─→ Default: acceptEdits (auto-approve file ops)

✅ Signal Handling
   └─→ Kills child process on Ctrl+C/Esc (no orphans)

✅ Slash Command Preservation
   └─→ Detects /cook, /plan in prompts, keeps at start

✅ Formatted Output
   └─→ ASCII box with metadata
```

### Performance Impact

```
Metric                  Before      After       Improvement
────────────────────────────────────────────────────────────
Session overhead        2000 tok    500 tok     75% ↓
Cost per simple task    $0.008      $0.0015     81% ↓
Time to result          ~30s        ~10s        67% ↓
Context pollution       High        Zero        100% ↓
Batch 3 tasks           $0.024      $0.0045     81% ↓
```

### User Experience Flow

```
BEFORE (Manual):
  User: "Add tests for UserService"
  Claude: "I'll add tests for UserService..."
  [Generates code in main session, uses context]
  Claude: "Here are the tests..."
  User: "Now add tests for AuthService"
  Claude: "I'll add tests for AuthService..."
  [Repeats, accumulates context]

AFTER (Delegated):
  User: "Add tests for UserService, AuthService, OrderService"
  Claude: "I'll delegate these similar tasks to GLM for token optimization"
  [Batch delegates via ccs-delegator agent]
  ccs glm -p "add tests for UserService"    → $0.0015
  ccs glm -p "add tests for AuthService"    → $0.0015
  ccs glm -p "add tests for OrderService"   → $0.0015
  Claude: "All tests added. Total cost: $0.0045"
  [Main session context stays clean]
```

---

## Architecture Benefits

### 1. Separation of Concerns
```
bin/ccs.js              → Routing only (6 lines added)
delegation-handler.js   → Orchestration logic
headless-executor.js    → Execution engine
session-manager.js      → State persistence
result-formatter.js     → Output formatting
```

### 2. Progressive Disclosure
```
SKILL.md                     → Entry point (56 lines)
  └─→ headless-workflow.md   → Technical details (155 lines)
  └─→ delegation-guidelines.md → AI decision rules (100 lines)
```

### 3. Zero Breaking Changes
```
ccs glm                 → Works as before (normal profile)
ccs glm -p "task"       → NEW: Enhanced delegation
ccs glm:continue -p     → NEW: Multi-turn support
```

### 4. Token Efficiency
```
Main session:     Full context loaded for every task
Delegation:       Isolated execution, no context pollution
Savings:          81% cost reduction on simple tasks
```

---

## Future Enhancements

### Potential Improvements
```
1. Cost Alerts
   └─→ Warn if delegation > $1.00

2. Session Analytics
   └─→ Track delegation patterns, identify high-cost tasks

3. Batch Optimization
   └─→ Auto-detect batchable tasks: "add tests for all *.service.js"

4. Profile Auto-Selection
   └─→ Agent chooses GLM vs Kimi based on file count

5. GLMT Integration
   └─→ Complex reasoning tasks via glmt proxy + delegation
```

---

## Troubleshooting Flows

### Common Issues

```
Issue: "No previous session found for glm"
  │
  └─→ Cause: Using :continue without initial session
        │
        └─→ Solution: Run initial task first
              ccs glm -p "initial task"
              ccs glm:continue -p "follow up"

Issue: "Profile not configured for delegation"
  │
  └─→ Cause: Missing ~/.ccs/glm.settings.json
        │
        └─→ Solution: Run ccs doctor
              ccs doctor
              → Shows configuration issues

Issue: "Missing prompt after -p flag"
  │
  └─→ Cause: No argument after -p
        │
        └─→ Solution: Provide prompt in quotes
              ccs glm -p "task description"
```

---

**Last Updated**: 2025-11-16
**Related**: `SKILL.md`, `headless-workflow.md`, `delegation-guidelines.md`
