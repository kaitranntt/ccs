# CCS Skill

Agent skill for optimizing token usage through CCS delegation and managing alternative model profiles.

## Structure

```
.claude/skills/ccs/
├── SKILL.md                              # Main skill entry point (<100 lines)
├── README.md                             # This file
├── references/                           # Detailed documentation
│   ├── delegation-guide.md               # Complete slash command usage
│   ├── profile-setup.md                  # GLM/Kimi profile configuration
│   ├── troubleshooting.md                # Common issues and solutions
│   └── best-practices.md                 # When to delegate vs main session
├── scripts/                              # Validation tools
│   └── validate-setup.js                 # CCS installation checker
└── assets/                               # Example configurations
    └── delegation-rules.example.json     # Example delegation rules
```

## Usage

The skill is automatically activated when:
- User mentions CCS, delegation, or token optimization
- User gets delegation-related errors
- Claude detects simple tasks that could be delegated
- User asks about GLM or Kimi profiles

## Validation

Check CCS delegation setup:

```bash
node .claude/skills/ccs/scripts/validate-setup.js
```

Or use CCS built-in doctor:

```bash
ccs doctor
```

## References

- [CCS Repository](https://github.com/kaitranntt/ccs)
- [CCS Documentation](https://github.com/kaitranntt/ccs#readme)
- [Delegation System Design](../../../claude-plans/20251115-0750-ccs-delegation-system/plan.md)

## Progressive Disclosure

This skill uses progressive disclosure:

1. **SKILL.md** - Always loaded (~80 lines)
   - Quick overview
   - When to use
   - Basic commands
   - Links to references

2. **references/** - Loaded as needed
   - Detailed workflows
   - Troubleshooting guides
   - Best practices
   - Setup instructions

3. **scripts/** - Executed without loading
   - Setup validation
   - Diagnostic tools

4. **assets/** - Referenced as needed
   - Example configurations
   - Templates

This design keeps context usage minimal while providing comprehensive guidance.
