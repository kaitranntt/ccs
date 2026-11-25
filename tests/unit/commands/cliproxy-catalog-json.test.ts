import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { handleCatalogJson } from '../../../src/commands/cliproxy/catalog-subcommand';
import { handleCliproxyCommand } from '../../../src/commands/cliproxy/index';

let originalConsoleLog: typeof console.log;
let capturedOutput: string[];

beforeEach(() => {
  originalConsoleLog = console.log;
  capturedOutput = [];
  console.log = (...args: unknown[]) => {
    capturedOutput.push(args.map(String).join(' '));
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
});

describe('cliproxy catalog --json output', () => {
  it('outputs valid JSON mapping provider names to model arrays', () => {
    handleCatalogJson();

    expect(capturedOutput).toHaveLength(1);
    const parsed = JSON.parse(capturedOutput[0]) as Record<string, unknown[]>;

    // Must be a non-empty object (static catalog always has providers)
    expect(typeof parsed).toBe('object');
    expect(Object.keys(parsed).length).toBeGreaterThan(0);

    // Every provider entry must be an array of objects with at least id and name
    for (const models of Object.values(parsed)) {
      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      for (const model of models as Array<Record<string, unknown>>) {
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
      }
    }
  });

  it('includes metadata fields when present on model entries', () => {
    handleCatalogJson();

    const parsed = JSON.parse(capturedOutput[0]) as Record<string, Array<Record<string, unknown>>>;
    const allModels = Object.values(parsed).flat();

    // At least some models in the static catalog have tier set
    const withTier = allModels.filter((m) => m.tier !== undefined);
    expect(withTier.length).toBeGreaterThan(0);

    // Tier values must be one of the allowed strings
    for (const model of withTier) {
      expect<unknown[]>(['free', 'pro', 'ultra']).toContain(model.tier);
    }

    const withContextWindow = allModels.filter((m) => m.contextWindow !== undefined);
    expect(withContextWindow.length).toBeGreaterThan(0);
    for (const model of withContextWindow) {
      expect(Number.isInteger(model.contextWindow)).toBe(true);
      expect(model.contextWindow as number).toBeGreaterThan(0);
    }
  });

  it('omits undefined optional fields instead of including nulls', () => {
    handleCatalogJson();

    const parsed = JSON.parse(capturedOutput[0]) as Record<string, Array<Record<string, unknown>>>;
    const allModels = Object.values(parsed).flat();

    for (const model of allModels) {
      for (const value of Object.values(model)) {
        expect(value).not.toBeNull();
        expect(value).not.toBeUndefined();
      }
    }
  });

  it('includes explicit false boolean values in output', () => {
    handleCatalogJson();

    const parsed = JSON.parse(capturedOutput[0]) as Record<string, Array<Record<string, unknown>>>;
    const allModels = Object.values(parsed).flat();

    // Static catalog has models with extendedContext: false
    const withExplicitFalse = allModels.filter((m) => m.extendedContext === false);
    expect(withExplicitFalse.length).toBeGreaterThan(0);
  });

  it('includes thinking configuration when present on models', () => {
    handleCatalogJson();

    const parsed = JSON.parse(capturedOutput[0]) as Record<string, Array<Record<string, unknown>>>;
    const allModels = Object.values(parsed).flat();

    // Static catalog has thinking models (e.g. Claude Opus 4.6 Thinking)
    const withThinking = allModels.filter((m) => m.thinking !== undefined);
    expect(withThinking.length).toBeGreaterThan(0);

    for (const model of withThinking) {
      const thinking = model.thinking as Record<string, unknown>;
      expect<unknown[]>(['budget', 'levels', 'none']).toContain(thinking.type);
    }
  });

  it('outputs minified JSON (single line, no whitespace formatting)', () => {
    handleCatalogJson();

    const output = capturedOutput[0];
    expect(output.includes('\n')).toBe(false);
    expect(JSON.stringify(JSON.parse(output))).toBe(output);
  });
});

describe('cliproxy catalog --json routing', () => {
  it('routes catalog --json through handleCliproxyCommand', async () => {
    await handleCliproxyCommand(['catalog', '--json']);

    expect(capturedOutput).toHaveLength(1);
    const parsed = JSON.parse(capturedOutput[0]);
    expect(typeof parsed).toBe('object');
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  it('--json takes priority over refresh subcommand', async () => {
    await handleCliproxyCommand(['catalog', 'refresh', '--json']);

    expect(capturedOutput).toHaveLength(1);
    // Should output JSON, not refresh output
    const parsed = JSON.parse(capturedOutput[0]);
    expect(typeof parsed).toBe('object');
  });

  it('--json takes priority when placed before subcommand', async () => {
    await handleCliproxyCommand(['catalog', '--json', 'reset']);

    expect(capturedOutput).toHaveLength(1);
    const parsed = JSON.parse(capturedOutput[0]);
    expect(typeof parsed).toBe('object');
  });
});
