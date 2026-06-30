import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { Settings } from '../types/config';
import { stripAnthropicRoutingEnv } from './shell-executor';

export interface OpenAICompatLaunchSettings {
  settingsPath: string;
  cleanup: () => void;
}

// SIBLING HELPER: src/cliproxy/executor/launch-settings.ts (prepareLaunchSettings)
// solves the same problem by OVERLAYING resolved routing values instead of
// stripping them. This strip-based variant is required where callers deliberately
// delete a routing key (e.g. ANTHROPIC_API_KEY in settings-flow) and need it
// ABSENT from the launch settings. Do not unify without an explicit force-absent
// key list — see issue #1609.
export function createOpenAICompatLaunchSettings(
  settingsPath: string,
  settings: Settings
): OpenAICompatLaunchSettings {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-openai-compat-settings-'));
  fs.chmodSync(tempDir, 0o700);

  const launchSettings = JSON.parse(JSON.stringify(settings)) as Settings;
  const sanitizedEnv = Object.fromEntries(
    Object.entries(stripAnthropicRoutingEnv({ ...(launchSettings.env ?? {}) })).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );

  if (Object.keys(sanitizedEnv).length > 0) {
    launchSettings.env = sanitizedEnv;
  } else {
    delete launchSettings.env;
  }

  const launchSettingsPath = path.join(tempDir, path.basename(settingsPath));
  fs.writeFileSync(launchSettingsPath, JSON.stringify(launchSettings, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });

  let cleanedUp = false;
  const cleanup = (): void => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    fs.rmSync(tempDir, { recursive: true, force: true });
  };

  return {
    settingsPath: launchSettingsPath,
    cleanup,
  };
}
