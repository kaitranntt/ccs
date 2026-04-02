import { describe, expect, test } from 'bun:test';

import { evaluateTargetRuntimeCompatibility } from '../../../src/targets/target-runtime-compatibility';

describe('evaluateTargetRuntimeCompatibility', () => {
  test('rejects account, copilot, and cursor profiles on Droid target', () => {
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'droid',
        profileType: 'account',
      }).supported
    ).toBe(false);
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'droid',
        profileType: 'copilot',
      }).supported
    ).toBe(false);
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'droid',
        profileType: 'cursor',
      }).supported
    ).toBe(false);
  });

  test('supports native Codex default sessions', () => {
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'codex',
        profileType: 'default',
      }).supported
    ).toBe(true);
  });

  test('supports Codex CLIProxy provider sessions only for provider codex', () => {
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'codex',
        profileType: 'cliproxy',
        cliproxyProvider: 'codex',
        isComposite: false,
      }).supported
    ).toBe(true);

    const unsupported = evaluateTargetRuntimeCompatibility({
      target: 'codex',
      profileType: 'cliproxy',
      cliproxyProvider: 'gemini',
      isComposite: false,
    });
    expect(unsupported.supported).toBe(false);
    expect(unsupported.reason).toMatch(/only supports CLIProxy provider "codex"/);
  });

  test('rejects composite CLIProxy variants on Codex target', () => {
    const compatibility = evaluateTargetRuntimeCompatibility({
      target: 'codex',
      profileType: 'cliproxy',
      cliproxyProvider: 'codex',
      isComposite: true,
    });

    expect(compatibility.supported).toBe(false);
    expect(compatibility.reason).toMatch(/does not support composite CLIProxy variants/);
  });

  test('supports only Codex bridge API profiles on Codex target', () => {
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'codex',
        profileType: 'settings',
        cliproxyBridgeProvider: 'codex',
      }).supported
    ).toBe(true);

    const compatibility = evaluateTargetRuntimeCompatibility({
      target: 'codex',
      profileType: 'settings',
      cliproxyBridgeProvider: 'gemini',
    });
    expect(compatibility.supported).toBe(false);
    expect(compatibility.reason).toMatch(/only supports CLIProxy Codex bridge profiles/);

    const genericSettingsCompatibility = evaluateTargetRuntimeCompatibility({
      target: 'codex',
      profileType: 'settings',
    });
    expect(genericSettingsCompatibility.supported).toBe(false);
    expect(genericSettingsCompatibility.reason).toMatch(/currently supports native default sessions/);
  });

  test('rejects account, copilot, and cursor profiles on Codex target', () => {
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'codex',
        profileType: 'account',
      }).supported
    ).toBe(false);
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'codex',
        profileType: 'copilot',
      }).supported
    ).toBe(false);
    expect(
      evaluateTargetRuntimeCompatibility({
        target: 'codex',
        profileType: 'cursor',
      }).supported
    ).toBe(false);
  });
});
