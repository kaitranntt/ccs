/**
 * ConfigFilesChecker GLM model-drift detection unit tests.
 *
 * Verifies the doctor warns when an existing glm.settings.json lags the
 * canonical GLM default (read from the provider preset catalog), and stays
 * silent when up to date or absent. Uses CCS_HOME isolation so the real
 * ~/.ccs is never touched.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ConfigFilesChecker } from '../config-check';
import { HealthCheck } from '../types';
import { PROVIDER_PRESET_DEFINITIONS } from '../../../shared/provider-preset-catalog';

// Mirror the catalog lookup used by config-check.ts so the test follows the
// same source of truth (and will keep passing if the default bumps later).
const GLM_DEFAULT_MODEL =
  PROVIDER_PRESET_DEFINITIONS.find((preset) => preset.id === 'glm')?.defaultModel ?? 'glm-5.2';

function glmSettings(model: string): string {
  return JSON.stringify({
    env: {
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      ANTHROPIC_AUTH_TOKEN: 'YOUR_GLM_API_KEY_HERE',
      ANTHROPIC_MODEL: model,
    },
  });
}

describe('ConfigFilesChecker - GLM model drift', () => {
  let tempHome: string;
  let ccsDir: string;
  let originalCcsHome: string | undefined;

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-config-check-'));
    // getCcsDir() appends '.ccs' to CCS_HOME, so config files live there.
    ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(ccsDir, { recursive: true });
    originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;
    // Minimal config.yaml so checkMainConfig passes without erroring.
    fs.writeFileSync(path.join(ccsDir, 'config.yaml'), 'version: 1\n', 'utf8');
  });

  afterEach(() => {
    if (originalCcsHome === undefined) {
      delete process.env.CCS_HOME;
    } else {
      process.env.CCS_HOME = originalCcsHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  it('warns when glm.settings.json uses a model older than the default', () => {
    fs.writeFileSync(path.join(ccsDir, 'glm.settings.json'), glmSettings('glm-5'), 'utf8');

    const results = new HealthCheck();
    new ConfigFilesChecker().run(results);

    const drift = results.warnings.find((w) => w.name === 'GLM Model');
    expect(drift).toBeDefined();
    expect(drift?.message).toContain('glm-5');
    expect(drift?.message).toContain(GLM_DEFAULT_MODEL);
    expect(drift?.fix).toBe(`Run: ccs config set glm model ${GLM_DEFAULT_MODEL}`);
  });

  it('stays silent when glm.settings.json matches the default', () => {
    fs.writeFileSync(
      path.join(ccsDir, 'glm.settings.json'),
      glmSettings(GLM_DEFAULT_MODEL),
      'utf8'
    );

    const results = new HealthCheck();
    new ConfigFilesChecker().run(results);

    expect(results.warnings.find((w) => w.name === 'GLM Model')).toBeUndefined();
  });

  it('stays silent when no glm.settings.json exists', () => {
    const results = new HealthCheck();
    new ConfigFilesChecker().run(results);

    expect(results.warnings.find((w) => w.name === 'GLM Model')).toBeUndefined();
  });
});
