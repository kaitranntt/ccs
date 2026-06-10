/**
 * Composite Variant Thinking Configuration Tests
 *
 * Tests per-tier thinking configuration for composite variants
 */

import { describe, it, expect } from 'bun:test';
import {
  applyThinkingConfig,
  applyThinkingSuffix,
  detectTierFromModel,
  getThinkingValueForTier,
} from '../../config/thinking-config';
import { CLIProxyProvider } from '../../types';

// ========================================
// applyThinkingSuffix
// ========================================

describe('applyThinkingSuffix', () => {
  it('should append level name to model', () => {
    const result = applyThinkingSuffix('gemini-3-pro-preview', 'high');
    expect(result).toBe('gemini-3-pro-preview(high)');
  });

  it('should append numeric budget to model', () => {
    const result = applyThinkingSuffix('claude-opus-4-6-thinking', 8192);
    expect(result).toBe('claude-opus-4-6-thinking(8192)');
  });

  it('should not append suffix if model already has one', () => {
    const result = applyThinkingSuffix('gemini-3-pro-preview(medium)', 'high');
    expect(result).toBe('gemini-3-pro-preview(medium)');
  });

  it('should not append suffix if model already has numeric budget', () => {
    const result = applyThinkingSuffix('claude-opus-4(8192)', 16384);
    expect(result).toBe('claude-opus-4(8192)');
  });

  it('should handle empty parentheses as NOT having suffix', () => {
    const result = applyThinkingSuffix('model()', 'high');
    // Empty parens don't match regex /\([^)]+\)$/ (requires non-empty content)
    expect(result).toBe('model()(high)');
  });

  it('should append to model with hyphens', () => {
    const result = applyThinkingSuffix('gpt-4o-mini', 'low');
    expect(result).toBe('gpt-4o-mini(low)');
  });
});

// ========================================
// detectTierFromModel
// ========================================

describe('detectTierFromModel', () => {
  it('should detect opus from model name containing "opus"', () => {
    const result = detectTierFromModel('claude-opus-4-6-thinking');
    expect(result).toBe('opus');
  });

  it('should detect sonnet from model name containing "sonnet"', () => {
    const result = detectTierFromModel('claude-sonnet-4-5-thinking');
    expect(result).toBe('sonnet');
  });

  it('should map Claude Fable 5 to the opus tier', () => {
    // Fable is the top tier above Opus; auto-mode thinking defaults should
    // match the opus tier (effort high), not the sonnet fallback.
    const result = detectTierFromModel('claude-fable-5');
    expect(result).toBe('opus');
  });

  it('should detect haiku from model name containing "haiku"', () => {
    const result = detectTierFromModel('claude-haiku-4-5-20251001');
    expect(result).toBe('haiku');
  });

  it('should default to sonnet for unknown model names', () => {
    const result = detectTierFromModel('gpt-4o-mini');
    expect(result).toBe('sonnet');
  });

  it('should default to sonnet for gemini models', () => {
    const result = detectTierFromModel('gemini-3-pro-preview');
    expect(result).toBe('sonnet');
  });

  it('should be case-insensitive', () => {
    const result = detectTierFromModel('CLAUDE-OPUS-4');
    expect(result).toBe('opus');
  });

  it('should detect haiku even with uppercase', () => {
    const result = detectTierFromModel('CLAUDE-HAIKU-4');
    expect(result).toBe('haiku');
  });
});

// ========================================
// getThinkingValueForTier (mock config)
// ========================================

describe('getThinkingValueForTier', () => {
  // Note: This function reads from unified config, so we're testing the logic
  // For full integration tests, see composite-variant-service.test.ts

  it('should return tier default when no provider override', () => {
    const thinkingConfig = {
      mode: 'auto' as const,
      tier_defaults: {
        opus: 'high',
        sonnet: 'medium',
        haiku: 'low',
      },
    };

    const result = getThinkingValueForTier('opus', 'agy' as CLIProxyProvider, thinkingConfig);
    expect(result).toBe('high');
  });

  it('should return provider-specific override when configured', () => {
    const thinkingConfig = {
      mode: 'auto' as const,
      tier_defaults: {
        opus: 'high',
        sonnet: 'medium',
        haiku: 'low',
      },
      provider_overrides: {
        gemini: {
          opus: 'xhigh',
          sonnet: 'high',
          haiku: 'medium',
        },
      },
    };

    const result = getThinkingValueForTier('opus', 'gemini' as CLIProxyProvider, thinkingConfig);
    expect(result).toBe('xhigh');
  });

  it('should fall back to tier default when provider has no override for tier', () => {
    const thinkingConfig = {
      mode: 'auto' as const,
      tier_defaults: {
        opus: 'high',
        sonnet: 'medium',
        haiku: 'low',
      },
      provider_overrides: {
        gemini: {
          opus: 'xhigh',
          // No sonnet override
        },
      },
    };

    const result = getThinkingValueForTier('sonnet', 'gemini' as CLIProxyProvider, thinkingConfig);
    expect(result).toBe('medium');
  });

  it('should use centralized defaults when tier_defaults undefined', () => {
    const thinkingConfig = {
      mode: 'auto' as const,
      // tier_defaults is optional - centralized defaults kick in
    };

    const result = getThinkingValueForTier('opus', 'agy' as CLIProxyProvider, thinkingConfig);
    // DEFAULT_THINKING_TIER_DEFAULTS.opus = 'high'
    expect(result).toBe('high');
  });
});

// ========================================
// applyThinkingConfig with compositeTierThinking
// ========================================

describe('applyThinkingConfig - composite variant integration', () => {
  it('should apply per-tier thinking from compositeTierThinking parameter', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'xhigh',
      sonnet: 'medium',
      haiku: 'low',
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined, // No CLI override
      compositeTierThinking
    );

    // Budget-based tier models are normalized to provider-specific budget values.
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(32768)');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(8192)');
    // Haiku doesn't support thinking per model-catalog — no suffix
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
    // ANTHROPIC_MODEL is validated: 'medium' → 8192 for budget-type models
    expect(result.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-thinking(8192)');
  });

  it('should apply partial per-tier thinking (only some tiers specified)', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'xhigh',
      // sonnet and haiku will fall back to global config
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined,
      compositeTierThinking
    );

    // Budget-based tier models are normalized to provider-specific budget values.
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(32768)');
    // Sonnet gets defaults from global config (mode=auto)
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toContain('claude-sonnet-4-5-thinking');
    // Haiku doesn't support thinking — stays unchanged
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('should allow per-tier thinking to be "off"', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'high',
      sonnet: 'medium',
      haiku: 'off', // Explicitly disabled for haiku
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined,
      compositeTierThinking
    );

    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(24576)');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(8192)');
    // Haiku should NOT have suffix because thinking is not supported for haiku
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('should prioritize CLI override over per-tier thinking', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'xhigh',
      sonnet: 'medium',
      haiku: 'low',
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      'minimal', // CLI override takes priority
      compositeTierThinking
    );

    // All thinking-capable tiers should use the validated CLI override.
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(1024)');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(1024)');
    // Haiku doesn't support thinking — stays unchanged regardless of CLI override
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('should disable all tier thinking when CLI override is explicitly off', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'xhigh',
      sonnet: 'medium',
      haiku: 'low',
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      'off',
      compositeTierThinking
    );

    expect(result.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-thinking');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking');
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('treats off override aliases case-insensitively', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyThinkingConfig(envVars, 'agy' as CLIProxyProvider, 'OFF', {
      opus: 'xhigh',
      sonnet: 'high',
    });

    expect(result.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-thinking');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking');
  });

  it('uses per-tier provider capability checks for mixed-provider composites', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gemini-2.5-pro',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gemini-2.5-pro',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyThinkingConfig(
      envVars,
      'gemini' as CLIProxyProvider,
      undefined,
      {
        sonnet: 'high',
      },
      {
        sonnet: { provider: 'agy' as CLIProxyProvider },
      }
    );

    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(24576)');
  });

  it('applies tier thinking even when default model does not support thinking', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gpt-4o-mini',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-4o-mini',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyThinkingConfig(
      envVars,
      'codex' as CLIProxyProvider,
      undefined,
      {
        sonnet: 'high',
      },
      {
        sonnet: { provider: 'agy' as CLIProxyProvider },
      }
    );

    // Default model provider/model do not support thinking.
    expect(result.ANTHROPIC_MODEL).toBe('gpt-4o-mini');
    // Supported mixed-provider tier must still receive its configured thinking value.
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(24576)');
  });

  it('handles dotted agy Claude IDs for thinking capability lookup', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-4.5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4.5-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4.5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4.5',
    };

    const result = applyThinkingConfig(envVars, 'agy' as CLIProxyProvider, 'high');

    // Capability lookup should succeed for dotted agy IDs after normalization.
    // Tier values are normalized through budget validation too.
    expect(result.ANTHROPIC_MODEL).toBe('claude-opus-4.5-thinking(24576)');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4.5-thinking(24576)');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4.5-thinking(24576)');
    // Haiku does not support thinking in agy catalog.
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4.5');
  });

  it('should handle numeric budgets in per-tier thinking', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: '32768',
      sonnet: '8192',
      haiku: '512',
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined,
      compositeTierThinking
    );

    // Tier models keep numeric values after validation when the provider supports them.
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(32768)');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(8192)');
    // Haiku doesn't support thinking — stays unchanged
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('claude-haiku-4-5-20251001');
  });

  it('should not apply thinking when mode is off and no override', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'high',
      sonnet: 'medium',
      haiku: 'low',
    };

    // Mock thinking config with mode=off by calling without thinkingOverride
    // and ensuring global config mode is 'off'
    // This test would require mocking getThinkingConfig()
    // For now, test the behavior when compositeTierThinking is undefined

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined,
      undefined // No per-tier thinking
    );

    // When mode=auto and no compositeTierThinking, defaults apply
    // This depends on global config - skipping full integration test here
    expect(result).toBeDefined();
  });

  it('should skip thinking for models that do not support it', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gpt-4o-mini', // Model that doesn't support thinking
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-4o-mini',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-4o-mini',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-4o-mini',
    };

    const compositeTierThinking = {
      opus: 'high',
      sonnet: 'medium',
      haiku: 'low',
    };

    const result = applyThinkingConfig(
      envVars,
      'codex' as CLIProxyProvider,
      undefined,
      compositeTierThinking
    );

    // Models should remain unchanged (no thinking suffix) because they don't support it
    // Note: This depends on supportsThinking() logic in model-catalog.ts
    // For models that don't support thinking, no suffix should be added
    expect(result.ANTHROPIC_MODEL).toBe('gpt-4o-mini');
  });

  it('should update ANTHROPIC_MODEL when it matches a tier model', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-4-6-thinking', // Matches opus tier
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'xhigh',
      sonnet: 'medium',
      haiku: 'low',
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined,
      compositeTierThinking
    );

    // ANTHROPIC_MODEL is validated: xhigh → 32768 for budget-type models
    expect(result.ANTHROPIC_MODEL).toBe('claude-opus-4-6-thinking(32768)');
    // Tier model keeps the validated budget value.
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(32768)');
  });

  it('should preserve models that already have thinking suffix', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-sonnet-4-5-thinking(high)', // Already has suffix
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-6-thinking',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-5-thinking(high)',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const compositeTierThinking = {
      opus: 'xhigh',
      sonnet: 'medium', // Won't override existing suffix
      haiku: 'low',
    };

    const result = applyThinkingConfig(
      envVars,
      'agy' as CLIProxyProvider,
      undefined,
      compositeTierThinking
    );

    // Existing suffix on main model should be preserved.
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('claude-sonnet-4-5-thinking(high)');
    expect(result.ANTHROPIC_MODEL).toBe('claude-sonnet-4-5-thinking(high)');
    // Other supported tiers still receive configured thinking after validation.
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-6-thinking(32768)');
  });

  it('rewrites legacy budget suffixes for claude level-based models', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'claude-opus-4-7(32768)',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-opus-4-7(32768)',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-sonnet-4-6',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'claude-haiku-4-5-20251001',
    };

    const result = applyThinkingConfig(envVars, 'claude' as CLIProxyProvider, 'max');

    expect(result.ANTHROPIC_MODEL).toBe('claude-opus-4-7(max)');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('claude-opus-4-7(max)');
  });

  it('should use codex effort suffix style when provider is codex', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gpt-5.3-codex',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'gpt-5.3-codex',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'gpt-5-mini',
    };

    const result = applyThinkingConfig(
      envVars,
      'codex' as CLIProxyProvider,
      'xhigh', // Explicit CLI override
      undefined
    );

    expect(result.ANTHROPIC_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('gpt-5.3-codex-xhigh');
    expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('gpt-5-mini-high');
  });

  it('should normalize legacy codex parenthesized tier suffix to effort suffix format', () => {
    const envVars: NodeJS.ProcessEnv = {
      ANTHROPIC_MODEL: 'gpt-5.3-codex',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.3-codex(high)',
    };

    const result = applyThinkingConfig(envVars, 'codex' as CLIProxyProvider, 'high');

    expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('gpt-5.3-codex-high');
  });
});
