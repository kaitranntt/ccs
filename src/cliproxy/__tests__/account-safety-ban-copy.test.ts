/**
 * Tests for account-safety ban copy parameterization (Gap 3).
 *
 * Verifies that handleBanDetection uses provider-appropriate copy:
 *   - "Anthropic" for the claude provider
 *   - "Google"    for gemini / agy / codex
 * and that isBanResponse matches both shared and Anthropic-specific patterns.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, spyOn, afterEach, beforeEach } from 'bun:test';
import { isBanResponse, handleBanDetection } from '../accounts/account-safety';

// ── isBanResponse ─────────────────────────────────────────────────────────────

describe('isBanResponse', () => {
  it.each([
    'disabled in this account',
    'violation of terms of service',
    'account has been disabled',
    'account is disabled',
    'account has been suspended',
    'account has been banned',
  ])('matches shared ban pattern for all providers: %s', (pattern) => {
    expect(isBanResponse(pattern)).toBe(true);
    expect(isBanResponse(pattern.toUpperCase())).toBe(true);
    // Also matches when provider is specified
    expect(isBanResponse(pattern, 'gemini')).toBe(true);
    expect(isBanResponse(pattern, 'claude')).toBe(true);
  });

  it.each(['your account has been blocked', 'account is blocked'])(
    'matches Anthropic-specific ban pattern for claude provider: %s',
    (pattern) => {
      expect(isBanResponse(pattern, 'claude')).toBe(true);
    }
  );

  it.each(['your account has been blocked', 'account is blocked'])(
    'does NOT match Anthropic-specific ban pattern for non-claude providers: %s',
    (pattern) => {
      expect(isBanResponse(pattern, 'gemini')).toBe(false);
      expect(isBanResponse(pattern, 'agy')).toBe(false);
      expect(isBanResponse(pattern, 'codex')).toBe(false);
      // Without provider argument also should not match
      expect(isBanResponse(pattern)).toBe(false);
    }
  );

  it('does not match bare "usage policy" substring for any provider (avoids false positives)', () => {
    // A rate-limit message mentioning "usage policy" should not trigger ban
    const msg = 'Request exceeds usage policy limits for your plan';
    expect(isBanResponse(msg)).toBe(false);
    expect(isBanResponse(msg, 'gemini')).toBe(false);
    expect(isBanResponse(msg, 'claude')).toBe(false);
  });

  it('returns false for a benign error message', () => {
    expect(isBanResponse('rate limit exceeded')).toBe(false);
    expect(isBanResponse('network timeout')).toBe(false);
    expect(isBanResponse('')).toBe(false);
  });
});

// ── handleBanDetection ban copy ────────────────────────────────────────────────

describe('handleBanDetection ban copy', () => {
  const stderrLines: string[] = [];
  let writeSpy: ReturnType<typeof spyOn>;
  let consoleSpy: ReturnType<typeof spyOn>;
  let tempHome: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    originalCcsHome = process.env.CCS_HOME;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-ban-copy-'));
    process.env.CCS_HOME = tempHome;
  });

  const setup = () => {
    stderrLines.length = 0;
    writeSpy = spyOn(process.stderr, 'write').mockImplementation(
      (chunk: string | Uint8Array): boolean => {
        stderrLines.push(typeof chunk === 'string' ? chunk : '');
        return true;
      }
    );
    // Also capture console.error calls
    consoleSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      stderrLines.push(String(args[0] ?? ''));
    });
  };

  afterEach(() => {
    writeSpy?.mockRestore();
    consoleSpy?.mockRestore();
    process.env.CCS_HOME = originalCcsHome;
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('uses "Anthropic" actor copy for the claude provider', () => {
    setup();
    handleBanDetection('claude', 'test@example.com', 'account has been disabled');
    const output = stderrLines.join(' ');
    expect(output).toContain('Anthropic');
    expect(output).not.toContain('Google');
  });

  it('uses "Google" actor copy for the gemini provider', () => {
    setup();
    handleBanDetection('gemini', 'test@example.com', 'account has been disabled');
    const output = stderrLines.join(' ');
    expect(output).toContain('Google');
    expect(output).not.toContain('Anthropic');
  });

  it('uses "Google" actor copy for the agy provider', () => {
    setup();
    handleBanDetection('agy', 'test@example.com', 'account has been banned');
    const output = stderrLines.join(' ');
    expect(output).toContain('Google');
  });

  it('returns false for a non-ban error (no actor copy emitted)', () => {
    setup();
    const result = handleBanDetection('claude', 'test@example.com', 'rate limit exceeded');
    expect(result).toBe(false);
    // No ban message written
    expect(stderrLines.join(' ')).not.toContain('Anthropic');
  });
});
