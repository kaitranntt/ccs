import * as childProcess from 'child_process';
import * as path from 'path';
import { describe, expect, it } from 'bun:test';

const childTestPath = path.resolve(
  import.meta.dir,
  './fixtures/gemini-backend-guidance-child.scenario.ts'
);

function runScenario(scenario: string): void {
  const result = childProcess.spawnSync(process.execPath, ['test', childTestPath], {
    cwd: path.resolve(import.meta.dir, '../../..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      GEMINI_GUIDANCE_SCENARIO: scenario,
    },
  });

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  expect(result.status, output || `child scenario ${scenario} failed`).toBe(0);
}

describe('triggerOAuth Gemini backend guidance', () => {
  it('fails early on plus when Gemini OAuth client env vars are missing', () => {
    runScenario('plus-missing-env');
  });

  it('reports original backend Gemini incompatibility after probing direct CLI auth', () => {
    runScenario('original-direct-unsupported');
  });

  it('reports original backend Gemini incompatibility after probing headless auto paste mode', () => {
    runScenario('original-headless-auto-paste-unsupported');
  });

  it('allows pinned original binaries that still advertise Gemini login to continue past the probe', () => {
    runScenario('original-headless-auto-paste-supported');
  });
});
