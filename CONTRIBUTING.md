# CCS Contributing Guide

Welcome! We're excited you're interested in contributing to CCS. This guide will help you get started.

## 🚀 Quick Start for First-Time Contributors

**Never contributed before?** Start here:

1. **Find a good first issue**: Look for issues labeled [`good first issue`](https://github.com/kaitranntt/ccs/labels/good%20first%20issue)
2. **Read [CLAUDE.md](./CLAUDE.md)**: Understand the project architecture and v3.0 features
3. **Set up your environment**: See [Development Setup](#development-setup) below
4. **Make a small change**: Fix a typo, improve docs, or tackle a small bug
5. **Submit a PR**: We'll guide you through the review process

**Questions?** Open a [GitHub Discussion](https://github.com/kaitranntt/ccs/discussions) - we're here to help!

## Development Guidelines

### Philosophy

CCS follows these core principles:

- **YAGNI**: No features "just in case"
- **KISS**: Simple bash, no complexity
- **DRY**: One source of truth (config)

This tool does ONE thing well: enable instant switching between Claude accounts and alternative models.

### Code Standards

#### Compatibility Requirements

- **Unix**: bash 3.2+ compatibility
- **Windows**: PowerShell 5.1+ compatibility
- **Node.js**: Node.js 14+ (for npm package)
- **Dependencies**: Only jq (Unix) or built-in PowerShell (Windows)

#### Code Style

**Bash (Unix)**:
- Use `#!/usr/bin/env bash` shebang
- Quote variables: `"$VAR"` not `$VAR`
- Use `[[ ]]` for tests, not `[ ]`
- Follow existing indentation and naming patterns

**PowerShell (Windows)**:
- Use `CmdletBinding` and proper parameter handling
- Follow PowerShell verb-noun convention
- Use proper error handling with `try/catch`
- Maintain compatibility with PowerShell 5.1+

**Node.js (npm package)**:
- Use `child_process.spawn` for Claude CLI execution
- Handle SIGINT/SIGTERM for graceful shutdown
- Cross-platform path handling with `path` module
- ES modules preferred

### Testing

#### Platform Testing

Test on all platforms before submitting PR:
- macOS (bash)
- Linux (bash)
- Windows (PowerShell, CMD, Git Bash)

#### Test Scenarios

1. **Basic functionality**:
   ```bash
   ccs            # Should use default profile
   ccs glm        # Should use GLM profile
   ccs kimi       # Should use Kimi profile
   ccs --version  # Should show version
   ```

2. **v3.0 account-based profiles**:
   ```bash
   ccs auth create work     # Should open Claude for login
   ccs work "test"          # Should use work profile
   # Run in different terminal concurrently:
   ccs personal "test"      # Should use personal profile
   ```

3. **With arguments**:
   ```bash
   ccs glm --help
   ccs /plan "test"
   ```

4. **Error handling**:
   ```bash
   ccs invalid-profile    # Should show error
   ccs --invalid-flag     # Should pass through to Claude
   ```

### Branching Strategy

#### Branch Hierarchy

```
main (production) ← dev (integration) ← feat/* | fix/* | docs/*
     ↑                   ↑
     │                   └── All contributions merge here FIRST
     │
     └── Only: tested dev code OR hotfix/*
```

#### Branch Types

| Branch | Purpose | PRs Target | Releases To |
|--------|---------|------------|-------------|
| `main` | Production | From `dev` only | npm `@latest` |
| `dev` | Integration/testing | From `feat/*`, `fix/*` | npm `@dev` |
| `feat/*` | New features | → `dev` | - |
| `fix/*` | Bug fixes | → `dev` | - |
| `docs/*` | Documentation | → `dev` | - |
| `hotfix/*` | Critical fixes | → `main` directly | npm `@latest` |

#### Branch Naming Convention

```
<type>/<short-description>

# Examples:
feat/oauth-token-refresh
fix/doctor-missing-config
docs/update-installation-guide
hotfix/critical-security-fix
```

#### Development Workflow (Contributors)

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/ccs.git
cd ccs

# 2. Add upstream remote
git remote add upstream https://github.com/kaitranntt/ccs.git

# 3. ALWAYS start from latest DEV (not main!)
git checkout dev
git pull upstream dev

# 4. Create feature branch FROM DEV
git checkout -b feat/my-feature    # for features
git checkout -b fix/bug-name       # for bug fixes
git checkout -b docs/update-readme # for documentation

# 5. Make changes with conventional commits
git commit -m "feat(scope): add new feature"

# 6. Push to your fork
git push -u origin feat/my-feature

# 7. Create PR targeting DEV (not main!)
gh pr create --base dev --title "feat(scope): add new feature"
# → After merge, your changes release to npm @dev for testing

# 8. Maintainers will promote tested dev to main
# → This triggers npm @latest release

# 9. After PR merged, clean up
git checkout dev
git pull upstream dev
git branch -d feat/my-feature
```

#### Hotfix Workflow (Critical Production Fixes Only)

```bash
# Only for critical bugs in production!
# 1. Start from main
git checkout main
git pull upstream main

# 2. Create hotfix branch
git checkout -b hotfix/critical-bug

# 3. Fix and commit
git commit -m "fix: critical security vulnerability"

# 4. PR directly to main (skip dev)
gh pr create --base main --title "fix: critical security vulnerability"

# 5. After merge, sync to dev
# (Maintainers will handle this)
```

#### Rules

- **NEVER** commit directly to `main` or `dev`
- **ALWAYS** create branches from `dev` (not main)
- **ALWAYS** target PRs to `dev` (not main)
- **ONLY** `hotfix/*` branches target `main` directly
- **DELETE** branches after merge

### Submission Process

#### Before Submitting

1. Ensure branch is from `dev` (not main)
2. Ensure branch follows naming: `feat/*`, `fix/*`, `docs/*`
3. Run `bun run validate` - must pass
4. Rebase on latest dev: `git rebase dev`
5. Test on all platforms if possible

#### Pull Request Requirements

- **Target `dev` branch** (not main!) - unless hotfix
- Clear description of changes
- Testing instructions if applicable
- Link to relevant issues
- **All commits MUST follow conventional format** (enforced by husky)
- **Branch MUST follow naming convention** (`feat/*`, `fix/*`, etc.)
- Run `bun run validate` before submitting

#### Commit Message Style (MANDATORY)

**All commits MUST follow conventional commit format. Non-compliant commits are automatically rejected.**

```
type(scope): description

[optional body]

[optional footer]
```

**Commit types that trigger releases:**
| Type | Version Bump |
|------|--------------|
| `feat:` | MINOR (5.0.2 → 5.1.0) |
| `fix:` | PATCH (5.0.2 → 5.0.3) |
| `perf:` | PATCH |
| `feat!:` | MAJOR (5.0.2 → 6.0.0) |

**Commit types that DON'T trigger releases:**
`docs:`, `style:`, `refactor:`, `test:`, `chore:`, `ci:`, `build:`

**Examples:**
```bash
# Good - will be accepted
git commit -m "fix(installer): handle git worktree detection"
git commit -m "feat(config): support custom config location"
git commit -m "docs(readme): update installation instructions"
git commit -m "feat!: remove deprecated API"  # Breaking change

# Bad - will be REJECTED by husky
git commit -m "fixed bug"
git commit -m "WIP"
git commit -m "updated stuff"
```

### Development Setup

#### Local Development

```bash
# Clone your fork
git clone https://github.com/yourusername/ccs.git
cd ccs

# Create feature branch
git checkout -b your-feature-name

# Option 1: Test with built binary
# Test locally with ./dist/ccs.js

# Option 2: Symlink for seamless testing (recommended)
bun run build
bun run dev:symlink  # Symlinks global 'ccs' to dev version
# Now 'ccs' command uses your dev changes!

# Make changes
# Test with: ccs <command>

# When done developing:
bun run dev:unlink   # Restores original global ccs

# Run tests
# Test with: ccs <command>

# Run tests
bun run test           # All tests
bun run test:native    # Native Unix tests only
```

#### Testing npm Package Locally

```bash
# Build and test npm package
npm pack                              # Creates @kaitranntt-ccs-X.Y.Z.tgz
npm install -g @kaitranntt-ccs-X.Y.Z.tgz  # Test installation
ccs --version                         # Verify it works
ccs glm "test"                        # Test functionality

# Cleanup
npm uninstall -g @kaitranntt/ccs
rm @kaitranntt-ccs-X.Y.Z.tgz
rm -rf ~/.ccs  # Clean test environment
```

#### Testing Installer

```bash
# Test Unix installer
./installers/install.sh

# Test Windows installer (in PowerShell)
.\installers\install.ps1
```

### Areas for Contribution

**Looking for where to start?** Check [GitHub Issues](https://github.com/kaitranntt/ccs/issues) for:
- [`good first issue`](https://github.com/kaitranntt/ccs/labels/good%20first%20issue) - Great for first-time contributors
- [`help wanted`](https://github.com/kaitranntt/ccs/labels/help%20wanted) - We need your expertise!
- [`documentation`](https://github.com/kaitranntt/ccs/labels/documentation) - Improve our docs

#### Priority Areas

1. **v3.0 Enhancements**:
   - Profile management commands
   - Better instance isolation
   - Profile import/export

2. **Enhanced error handling**:
   - Better error messages
   - Recovery suggestions
   - Helpful Claude CLI detection

3. **Documentation**:
   - More usage examples
   - Integration guides
   - Video tutorials

4. **Testing**:
   - Expand test coverage
   - Add CI/CD tests
   - Performance benchmarks

#### Bug Fixes

- Installer issues on different platforms
- Edge cases in config parsing
- Windows-specific compatibility
- v3.0 concurrent session edge cases

### Review Process

**What to expect:**

1. **Automated checks** (GitHub Actions):
   - Syntax validation
   - Basic functionality tests
   - npm package build test

2. **Manual review** (usually within 1-3 days):
   - Code quality and style
   - Platform compatibility
   - Philosophy alignment (YAGNI/KISS/DRY)

3. **Testing** (by maintainers):
   - Cross-platform verification (macOS, Linux, Windows)
   - Integration testing
   - v3.0 features validation

**Tips for faster review:**
- Keep PRs focused and small
- Include tests for new features
- Test on multiple platforms before submitting
- Link to related issues

### Community

#### Getting Help

- **GitHub Issues**: Report bugs or request features
- **Discussions**: Ask questions or share ideas
- **README**: Check [README.md](./README.md) for usage examples

#### Communication Channels

- Primary: [GitHub Issues](https://github.com/kaitranntt/ccs/issues)
- Questions: [GitHub Discussions](https://github.com/kaitranntt/ccs/discussions)
- Updates: Watch the repository for release notifications

#### Code of Conduct

Be respectful, constructive, and focused on the project's philosophy of simplicity and reliability.

**We do not tolerate:**
- Harassment or discrimination
- Spam or off-topic comments
- Disrespectful or unprofessional behavior

**We encourage:**
- Helpful feedback and constructive criticism
- Collaboration and knowledge sharing
- Patience with newcomers

## 📚 Additional Resources

- **[CLAUDE.md](./CLAUDE.md)**: Technical architecture and v3.0 implementation details
- **[README.md](./README.md)**: User-facing documentation and examples
- **[GitHub Issues](https://github.com/kaitranntt/ccs/issues)**: Track bugs, features, and discussions
- **[VERSION](./VERSION)**: Current version number

## 🎯 Release Process (FULLY AUTOMATED)

**Releases are automated via semantic-release. DO NOT manually bump versions or create tags.**

### How Releases Work

1. **Write conventional commits** during development
2. **Merge PR to `main`** (or push to `dev`)
3. **CI automatically:**
   - Analyzes commits since last release
   - Determines version bump from commit types
   - Updates CHANGELOG.md, VERSION, package.json
   - Creates git tag
   - Publishes to npm
   - Creates GitHub release

### Release Channels

| Branch | npm Tag | Use Case |
|--------|---------|----------|
| `main` | `@latest` | Stable production releases |
| `dev` | `@dev` | Pre-release testing |

### Workflow

```bash
# Stable release
git checkout -b feat/my-feature
git commit -m "feat: add new feature"
gh pr create --base main
# → Merge PR → CI auto-releases to npm @latest

# Dev release
git checkout dev
git merge feat/experimental
git push origin dev
# → CI auto-releases to npm @dev
```

**NEVER DO:**
- `./scripts/bump-version.sh` (deprecated, emergency only)
- `git tag vX.Y.Z` (tags are auto-created)
- Manual `npm publish` (CI handles it)

## 📄 License

By contributing to CCS, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to CCS!**

Remember: Keep it simple, test thoroughly, and stay true to the YAGNI/KISS/DRY philosophy.