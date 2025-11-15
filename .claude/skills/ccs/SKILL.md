---
name: ccs
description: This skill should be used when working within a CCS (Claude Code Switch) environment to help users optimize token usage through delegation, configure alternative model profiles (GLM, Kimi), troubleshoot CCS installation issues, or understand when to delegate tasks vs keeping them in the main session. Use this skill proactively when detecting simple refactoring tasks, adding tests, fixing typos, or other repetitive tasks that could save tokens by delegating to cost-optimized models.
version: 1.0.0
---

# CCS (Claude Code Switch) Skill

Guide for using CCS delegation features to optimize token usage and manage multiple Claude profiles.

## Overview

CCS provides two main capabilities:

1. **Profile Switching** - Switch between multiple Claude accounts (work, personal, team)
2. **Delegation** - Delegate simple tasks to cost-optimized models (GLM-4.6, Kimi) within Claude Code sessions

This skill focuses on **delegation for token optimization**.

## Core Concepts

**Delegation System:**
- Execute simple tasks in isolated GLM/Kimi sessions via headless mode
- Save tokens on repetitive tasks (refactoring, tests, docs)
- Return detailed reports (files created/modified, duration, success/failure)
- Fresh session per delegation (no context pollution)

**Available Commands** (inside Claude Code sessions only):
- `/ccs:glm "task"` - Delegate to GLM-4.6 (cost-optimized)
- `/ccs:kimi "task"` - Delegate to Kimi (long-context tasks)
- `/ccs:create <model>` - Create custom delegation command

## When to Use This Skill

**Proactive delegation suggestions:**
- User asks for simple refactoring: "Suggest delegating to GLM to save tokens"
- User wants to add unit tests: "This is ideal for /ccs:glm delegation"
- User needs to fix typos/formatting: "Consider /ccs:glm for this simple task"
- User requests documentation updates: "Delegate to /ccs:glm to preserve main session tokens"

**Setup assistance:**
- User mentions "CCS" or "delegation"
- User reports delegation errors
- User asks about token optimization
- User wants to configure alternative models

**Troubleshooting:**
- User gets "invalid API key" errors
- User's delegation commands not working
- User asks "why isn't delegation working?"

## Basic Workflow

**1. Check CCS Installation:**
```bash
ccs --version
ccs doctor
```

**2. Validate Delegation Setup:**
Check if delegation commands exist and profiles are configured with valid API keys.

**3. Delegate Simple Tasks:**
```
/ccs:glm "refactor the authentication module to use async/await"
/ccs:kimi "add comprehensive unit tests for the payment service"
/ccs:glm "fix typos and formatting in README.md"
```

**4. Review Results:**
Delegation returns formatted report showing:
- Working directory used
- Files created/modified
- Duration and exit code
- Full task output

## Task Delegation Guidelines

**Ideal for delegation** (save tokens):
- Simple refactoring (extract functions, rename variables)
- Adding unit tests to existing code
- Fixing typos, formatting, linting issues
- Updating documentation
- Simple CRUD operations
- Repetitive code generation

**Keep in main session** (complexity/security):
- Architecture decisions
- Security implementations (auth, encryption)
- Complex debugging requiring conversation
- Performance optimization requiring profiling
- Database migrations
- Breaking changes

**Rule of thumb:**
- If task is deterministic and doesn't need discussion → Delegate
- If task requires back-and-forth or critical thinking → Main session

## References

For detailed information, see:

- [delegation-guide.md](./references/delegation-guide.md) - Complete delegation workflow and slash command usage
- [profile-setup.md](./references/profile-setup.md) - GLM/Kimi profile configuration and API keys
- [troubleshooting.md](./references/troubleshooting.md) - Common issues and solutions
- [best-practices.md](./references/best-practices.md) - When to delegate vs main session

## Scripts

Validate CCS setup and delegation readiness:
```bash
node .claude/skills/ccs/scripts/validate-setup.js
```

## Quick Troubleshooting

**"Delegation commands not found":**
- Run: `ccs doctor` to check installation
- Install: `npm install -g @kaitranntt/ccs --force`

**"Profile has placeholder API key":**
- Check: `~/.ccs/profiles/glm/settings.json`
- Update: Replace `YOUR_GLM_API_KEY_HERE` with real API key
- Validate: `ccs doctor` should show "glm ready"

**"Delegation failed with exit code 1":**
- Check delegation output for error details
- Verify CWD is correct
- Check if files mentioned in prompt exist
