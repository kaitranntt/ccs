# Design Report: delegation-rules.json Schema

**Date**: 2025-11-15
**Purpose**: Extremely detailed rules configuration for delegation logic

## Schema Definition

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "description": "Schema version for future compatibility",
      "default": "1.0.0"
    },
    "delegation": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "description": "Master toggle for delegation system",
          "default": true
        },
        "mode": {
          "type": "string",
          "enum": ["manual", "auto", "smart"],
          "description": "manual: user invokes only, auto: rule-based, smart: LLM-decided",
          "default": "manual"
        },
        "default_model": {
          "type": "string",
          "description": "Default model profile for delegation",
          "default": "glm"
        },
        "validation": {
          "type": "object",
          "properties": {
            "require_api_key": {
              "type": "boolean",
              "description": "Validate API key differs from default before delegation",
              "default": true
            },
            "check_profile_health": {
              "type": "boolean",
              "description": "Test profile reachability before delegation",
              "default": false
            }
          }
        },
        "limits": {
          "type": "object",
          "properties": {
            "max_tokens": {
              "type": "integer",
              "description": "Max input tokens for delegation (larger→main Claude)",
              "default": 4000
            },
            "timeout_seconds": {
              "type": "integer",
              "description": "Max time for delegated task execution",
              "default": 120
            },
            "max_files_modified": {
              "type": "integer",
              "description": "Max files to modify in delegation (safety limit)",
              "default": 10
            }
          }
        },
        "rules": {
          "type": "object",
          "description": "Rule-based delegation logic",
          "properties": {
            "keywords": {
              "type": "object",
              "description": "Keyword-based delegation triggers",
              "properties": {
                "always_delegate": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "Keywords that ALWAYS trigger delegation",
                  "default": [
                    "simple refactor",
                    "add unit tests",
                    "fix typo",
                    "format code",
                    "add comments",
                    "update documentation",
                    "rename variable"
                  ]
                },
                "never_delegate": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "Keywords that PREVENT delegation",
                  "default": [
                    "architecture",
                    "security",
                    "authentication",
                    "authorization",
                    "database schema",
                    "API design",
                    "performance critical",
                    "production"
                  ]
                },
                "prefer_delegate": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "Suggest delegation (not forced)",
                  "default": [
                    "implement",
                    "create tests",
                    "add logging",
                    "fix bug",
                    "update",
                    "modify"
                  ]
                }
              }
            },
            "file_patterns": {
              "type": "object",
              "properties": {
                "always_delegate": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "File patterns that ALWAYS delegate",
                  "default": [
                    "*.test.js",
                    "*.spec.ts",
                    "*.test.tsx",
                    "*.spec.jsx",
                    "**/__tests__/**",
                    "**/*.md",
                    "*.txt"
                  ]
                },
                "never_delegate": {
                  "type": "array",
                  "items": {"type": "string"},
                  "description": "File patterns that NEVER delegate",
                  "default": [
                    "**/auth/**",
                    "**/security/**",
                    "**/*.key",
                    "**/*.pem",
                    "**/config/production/**",
                    "Dockerfile",
                    "docker-compose.yml"
                  ]
                }
              }
            },
            "task_types": {
              "type": "object",
              "description": "Task type classification rules",
              "properties": {
                "code_generation": {
                  "type": "object",
                  "properties": {
                    "max_lines": {
                      "type": "integer",
                      "description": "Max lines for GLM code gen (larger→Claude)",
                      "default": 200
                    },
                    "complexity_threshold": {
                      "type": "string",
                      "enum": ["low", "medium", "high"],
                      "description": "Max complexity for delegation",
                      "default": "medium"
                    }
                  }
                },
                "refactoring": {
                  "type": "object",
                  "properties": {
                    "allow_architecture_changes": {
                      "type": "boolean",
                      "description": "Allow arch changes in delegation",
                      "default": false
                    },
                    "max_files": {
                      "type": "integer",
                      "description": "Max files to refactor in delegation",
                      "default": 3
                    }
                  }
                },
                "testing": {
                  "type": "object",
                  "properties": {
                    "auto_delegate": {
                      "type": "boolean",
                      "description": "Always delegate test creation",
                      "default": true
                    },
                    "coverage_threshold": {
                      "type": "integer",
                      "description": "Min coverage % to enforce",
                      "default": 80
                    }
                  }
                },
                "documentation": {
                  "type": "object",
                  "properties": {
                    "auto_delegate": {
                      "type": "boolean",
                      "description": "Always delegate docs writing",
                      "default": true
                    },
                    "types": {
                      "type": "array",
                      "items": {"type": "string"},
                      "default": ["README", "comments", "JSDoc", "API docs"]
                    }
                  }
                },
                "bug_fixes": {
                  "type": "object",
                  "properties": {
                    "severity_threshold": {
                      "type": "string",
                      "enum": ["low", "medium", "high", "critical"],
                      "description": "Max severity for delegation",
                      "default": "medium"
                    },
                    "require_tests": {
                      "type": "boolean",
                      "description": "Require test creation with fix",
                      "default": true
                    }
                  }
                }
              }
            },
            "context_size": {
              "type": "object",
              "properties": {
                "minimal": {
                  "type": "object",
                  "properties": {
                    "description": {"type": "string", "default": "Task only, no files"},
                    "max_tokens": {"type": "integer", "default": 500},
                    "auto_delegate": {"type": "boolean", "default": true}
                  }
                },
                "focused": {
                  "type": "object",
                  "properties": {
                    "description": {"type": "string", "default": "Task + relevant files"},
                    "max_tokens": {"type": "integer", "default": 2000},
                    "max_files": {"type": "integer", "default": 5},
                    "auto_delegate": {"type": "boolean", "default": true}
                  }
                },
                "full": {
                  "type": "object",
                  "properties": {
                    "description": {"type": "string", "default": "Task + full conversation"},
                    "max_tokens": {"type": "integer", "default": 10000},
                    "auto_delegate": {"type": "boolean", "default": false}
                  }
                }
              }
            }
          }
        },
        "models": {
          "type": "object",
          "description": "Per-model routing configuration",
          "properties": {
            "glm": {
              "type": "object",
              "properties": {
                "enabled": {"type": "boolean", "default": true},
                "priority": {"type": "integer", "default": 1},
                "use_cases": {
                  "type": "array",
                  "default": ["code_generation", "testing", "refactoring", "documentation"]
                }
              }
            },
            "glmt": {
              "type": "object",
              "properties": {
                "enabled": {"type": "boolean", "default": false},
                "priority": {"type": "integer", "default": 2},
                "use_cases": {
                  "type": "array",
                  "default": ["reasoning", "complex_debugging"]
                }
              }
            },
            "kimi": {
              "type": "object",
              "properties": {
                "enabled": {"type": "boolean", "default": false},
                "priority": {"type": "integer", "default": 3},
                "use_cases": {
                  "type": "array",
                  "default": ["long_context"]
                }
              }
            }
          }
        },
        "reporting": {
          "type": "object",
          "properties": {
            "verbosity": {
              "type": "string",
              "enum": ["minimal", "standard", "verbose"],
              "default": "standard"
            },
            "include_metadata": {
              "type": "boolean",
              "description": "Include timing, token count, etc.",
              "default": true
            },
            "show_validation_steps": {
              "type": "boolean",
              "description": "Show validation results in report",
              "default": false
            }
          }
        }
      }
    }
  }
}
```

## Default Configuration File

**Location**: `~/.ccs/delegation-rules.json`

```json
{
  "version": "1.0.0",
  "delegation": {
    "enabled": true,
    "mode": "manual",
    "default_model": "glm",
    "validation": {
      "require_api_key": true,
      "check_profile_health": false
    },
    "limits": {
      "max_tokens": 4000,
      "timeout_seconds": 120,
      "max_files_modified": 10
    },
    "rules": {
      "keywords": {
        "always_delegate": [
          "simple refactor", "add unit tests", "fix typo",
          "format code", "add comments", "update documentation"
        ],
        "never_delegate": [
          "architecture", "security", "authentication",
          "database schema", "API design", "production"
        ],
        "prefer_delegate": [
          "implement", "create tests", "add logging", "fix bug"
        ]
      },
      "file_patterns": {
        "always_delegate": [
          "*.test.js", "*.spec.ts", "**/__tests__/**", "**/*.md"
        ],
        "never_delegate": [
          "**/auth/**", "**/security/**", "**/*.key", "Dockerfile"
        ]
      },
      "task_types": {
        "testing": {
          "auto_delegate": true,
          "coverage_threshold": 80
        },
        "documentation": {
          "auto_delegate": true
        }
      }
    },
    "models": {
      "glm": {
        "enabled": true,
        "priority": 1
      }
    },
    "reporting": {
      "verbosity": "standard",
      "include_metadata": true
    }
  }
}
```

## Usage by Delegation Engine

```javascript
const rules = require('~/.ccs/delegation-rules.json');

function shouldDelegate(task) {
  if (!rules.delegation.enabled) return false;
  if (rules.delegation.mode === 'manual') return false;

  // Check never_delegate keywords
  for (const kw of rules.delegation.rules.keywords.never_delegate) {
    if (task.prompt.toLowerCase().includes(kw)) return false;
  }

  // Check always_delegate keywords
  for (const kw of rules.delegation.rules.keywords.always_delegate) {
    if (task.prompt.toLowerCase().includes(kw)) return true;
  }

  // Check file patterns...
  // Check task types...
  // Check context size...

  return false;  // Default: don't delegate
}
```

## Future Extension Points

1. **Smart Mode**: LLM analyzes task, decides delegation
2. **Learning**: Track success/failure, adjust rules
3. **Per-project rules**: `.ccs-delegation.json` overrides global
4. **Custom models**: User-defined model routing
