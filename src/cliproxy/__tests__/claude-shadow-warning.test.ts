/**
 * Tests for claude-shadow-warning.ts
 *
 * Gap 2: shadow warning — emitted once when a user profile named 'claude' or
 *   'anthropic' is present; not repeated; not emitted without a collision.
 * Gap 4: routing notice — emitted once on first claude provider launch.
 *
 * These tests use a temp CCS_HOME and a non-TTY stderr mock to confirm
 * write behaviour without relying on an interactive terminal.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

// Module under test — imported after CCS_HOME is set up in beforeEach via dynamic re-import.
// Because Bun caches modules, we test the exported functions in isolation by
// controlling the file-system state they depend on.
import { maybeWarnClaudeShadow, maybeShowClaudeRoutingNotice } from '../claude-shadow-warning';

// ── Helpers ───────────────────────────────────────────────────────────────────

function writeLegacyConfig(ccsDir: string, profiles: Record<string, string>): void {
  const configPath = path.join(ccsDir, 'config.json');
  fs.mkdirSync(ccsDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ profiles }), 'utf-8');
}

function markerDir(ccsDir: string): string {
  return path.join(ccsDir, 'cliproxy');
}

function shadowMarker(ccsDir: string): string {
  return path.join(markerDir(ccsDir), '.claude-shadow-warned');
}

function routingMarker(ccsDir: string): string {
  return path.join(markerDir(ccsDir), '.claude-routing-noticed');
}

// ── Test setup ────────────────────────────────────────────────────────────────

let tempHome: string;
let originalCcsHome: string | undefined;
let stderrLines: string[];
let stderrSpy: ReturnType<typeof spyOn>;
let originalIsTTYDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalCcsHome = process.env.CCS_HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-shadow-warn-'));
  process.env.CCS_HOME = tempHome;

  // Collect stderr writes without printing them
  stderrLines = [];
  stderrSpy = spyOn(process.stderr, 'write').mockImplementation(
    (chunk: string | Uint8Array): boolean => {
      stderrLines.push(typeof chunk === 'string' ? chunk : '');
      return true;
    }
  );

  // Save exact isTTY property descriptor so afterEach can restore it precisely
  originalIsTTYDescriptor = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');

  // Simulate a TTY so the TTY guard does not short-circuit
  Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
});

afterEach(() => {
  process.env.CCS_HOME = originalCcsHome;
  fs.rmSync(tempHome, { recursive: true, force: true });
  stderrSpy.mockRestore();
  // Restore isTTY to exactly what it was before the test
  if (originalIsTTYDescriptor !== undefined) {
    Object.defineProperty(process.stderr, 'isTTY', originalIsTTYDescriptor);
  } else {
    delete (process.stderr as { isTTY?: boolean }).isTTY;
  }
});

// ── Shadow warning (Gap 2) ────────────────────────────────────────────────────

describe('maybeWarnClaudeShadow', () => {
  it('does not emit a warning when no shadowed profiles exist', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeLegacyConfig(ccsDir, { myprofile: '/some/path' });

    maybeWarnClaudeShadow();

    expect(stderrLines.join('')).not.toContain('shadowed');
    expect(stderrLines.join('')).not.toContain('claude');
  });

  it('emits a warning when a profile named "claude" exists', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeLegacyConfig(ccsDir, { claude: '/path/to/claude.settings.json' });

    maybeWarnClaudeShadow();

    const output = stderrLines.join('');
    expect(output).toContain('claude');
    expect(output).toContain('shadowed');
    // Ensure warn() prefix is not doubled ([!] [!] ...)
    expect(output).not.toMatch(/\[!\]\s*\[!\]/);
  });

  it('emits a warning when a profile named "anthropic" exists', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeLegacyConfig(ccsDir, { anthropic: '/path/to/anthropic.settings.json' });

    maybeWarnClaudeShadow();

    const output = stderrLines.join('');
    expect(output).toContain('anthropic');
    expect(output).toContain('shadowed');
    // Ensure warn() prefix is not doubled
    expect(output).not.toMatch(/\[!\]\s*\[!\]/);
  });

  it('creates the dismissal marker after warning', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeLegacyConfig(ccsDir, { claude: '/path/to/settings.json' });

    maybeWarnClaudeShadow();

    expect(fs.existsSync(shadowMarker(ccsDir))).toBe(true);
  });

  it('does not repeat the warning when the marker already exists', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    writeLegacyConfig(ccsDir, { claude: '/path/to/settings.json' });
    // Pre-create marker
    const mDir = markerDir(ccsDir);
    fs.mkdirSync(mDir, { recursive: true });
    fs.writeFileSync(shadowMarker(ccsDir), 'already-shown');

    maybeWarnClaudeShadow();

    const output = stderrLines.join('');
    expect(output).not.toContain('shadowed');
  });

  it('does not warn when stderr is not a TTY', () => {
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });
    const ccsDir = path.join(tempHome, '.ccs');
    writeLegacyConfig(ccsDir, { claude: '/path/to/settings.json' });

    maybeWarnClaudeShadow();

    expect(stderrLines.join('')).not.toContain('shadowed');
  });

  it('emits a warning when an account profile named "claude" exists in profiles.json (legacy mode)', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    // Write an empty settings config (no settings profiles named claude)
    writeLegacyConfig(ccsDir, { myprofile: '/some/path' });
    // Write profiles.json with an account profile named 'claude'
    const profilesData = {
      version: '2.0.0',
      profiles: { claude: { type: 'account', created: new Date().toISOString(), last_used: null } },
      default: null,
    };
    fs.writeFileSync(path.join(ccsDir, 'profiles.json'), JSON.stringify(profilesData), 'utf-8');

    maybeWarnClaudeShadow();

    const output = stderrLines.join('');
    expect(output).toContain('claude');
    expect(output).toContain('shadowed');
  });
});

// ── Routing notice (Gap 4) ────────────────────────────────────────────────────

describe('maybeShowClaudeRoutingNotice', () => {
  it('emits routing notice on first call', () => {
    maybeShowClaudeRoutingNotice();

    const output = stderrLines.join('');
    expect(output).toContain('CLIProxy');
    // Ensure info() prefix is not doubled ([i] [i] ...)
    expect(output).not.toMatch(/\[i\]\s*\[i\]/);
  });

  it('creates the routing notice marker after first call', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    maybeShowClaudeRoutingNotice();

    expect(fs.existsSync(routingMarker(ccsDir))).toBe(true);
  });

  it('does not repeat the routing notice when the marker already exists', () => {
    const ccsDir = path.join(tempHome, '.ccs');
    const mDir = markerDir(ccsDir);
    fs.mkdirSync(mDir, { recursive: true });
    fs.writeFileSync(routingMarker(ccsDir), 'already-shown');

    maybeShowClaudeRoutingNotice();

    // No output at all
    expect(stderrLines.join('')).not.toContain('CLIProxy');
  });

  it('does not emit when stderr is not a TTY', () => {
    Object.defineProperty(process.stderr, 'isTTY', { value: false, configurable: true });

    maybeShowClaudeRoutingNotice();

    expect(stderrLines.join('')).not.toContain('CLIProxy');
  });
});
