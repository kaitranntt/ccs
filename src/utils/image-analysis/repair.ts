import * as fs from 'fs';
import * as path from 'path';
import InstanceManager from '../../management/instance-manager';
import { getCcsDir } from '../config-manager';
import {
  hasImageAnalyzerHook,
  installImageAnalyzerHook,
} from '../hooks/image-analyzer-hook-installer';
import { removeCcsImageAnalyzerHooks } from '../hooks/image-analyzer-hook-utils';
import { ensureImageAnalysisMcpOrThrow } from './mcp-installer';

export interface ImageAnalysisRepairStats {
  cleanedSettingsFiles: number;
  syncedInstances: number;
  managedToolReady: boolean;
  sharedHookReady: boolean;
}

function visitManagedImageAnalysisSettings(
  callback: (settings: Record<string, unknown>, settingsPath: string) => void,
  baseDir = getCcsDir()
): void {
  if (!fs.existsSync(baseDir)) {
    return;
  }

  for (const entry of fs.readdirSync(baseDir)) {
    if (!entry.endsWith('.settings.json')) {
      continue;
    }

    const settingsPath = path.join(baseDir, entry);
    try {
      const stat = fs.statSync(settingsPath);
      if (!stat.isFile()) {
        continue;
      }

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      callback(settings, settingsPath);
    } catch {
      // Best-effort cleanup; preserve malformed files for manual recovery.
    }
  }
}

export function countManagedImageAnalysisHookFiles(baseDir = getCcsDir()): number {
  let count = 0;
  visitManagedImageAnalysisSettings((settings) => {
    if (
      removeCcsImageAnalyzerHooks(JSON.parse(JSON.stringify(settings)) as Record<string, unknown>)
    ) {
      count += 1;
    }
  }, baseDir);

  return count;
}

export function cleanupManagedImageAnalysisHooks(baseDir = getCcsDir()): number {
  let cleaned = 0;
  visitManagedImageAnalysisSettings((settings, settingsPath) => {
    if (!removeCcsImageAnalyzerHooks(settings)) {
      return;
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
    cleaned += 1;
  }, baseDir);

  return cleaned;
}

export function syncManagedImageAnalysisInstances(
  instanceManager: InstanceManager = new InstanceManager()
): number {
  let synced = 0;
  for (const instanceName of instanceManager.listInstances()) {
    const instancePath = instanceManager.getInstancePath(instanceName);
    if (instanceManager.syncMcpServers(instancePath)) {
      synced += 1;
    }
  }
  return synced;
}

export function repairImageAnalysisRuntimeState(): ImageAnalysisRepairStats {
  const managedToolReady = ensureImageAnalysisMcpOrThrow();
  const sharedHookReady = hasImageAnalyzerHook() || installImageAnalyzerHook();
  const cleanedSettingsFiles = cleanupManagedImageAnalysisHooks();
  const syncedInstances = managedToolReady ? syncManagedImageAnalysisInstances() : 0;

  return {
    cleanedSettingsFiles,
    syncedInstances,
    managedToolReady,
    sharedHookReady,
  };
}
