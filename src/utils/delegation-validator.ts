#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { Settings } from '../types';
import { ValidationResult } from '../types/utils';
import { getCcsDir } from './config-manager';
import { getProfileLookupCandidates } from './profile-compat';

/**
 * Extended validation result for delegation profiles
 * Extends base ValidationResult with domain-specific fields
 */
interface DelegationValidationResult extends ValidationResult {
  error?: string;
  suggestion?: string;
  settingsPath?: string;
  apiKey?: string;
}

/**
 * Validates delegation profiles for CCS delegation system
 * Ensures profiles exist and have valid API keys configured
 */
export class DelegationValidator {
  /**
   * Validate a delegation profile
   * @param profileName - Name of profile to validate (e.g., 'glm', 'km')
   * @returns Validation result { valid: boolean, error?: string, settingsPath?: string }
   */
  static validate(profileName: string): DelegationValidationResult {
    const ccsDir = getCcsDir();
    const candidateSettingsPath = getProfileLookupCandidates(profileName)
      .map((candidate) => path.join(ccsDir, `${candidate}.settings.json`))
      .find((candidatePath) => fs.existsSync(candidatePath));
    const primarySettingsPath = path.join(ccsDir, `${profileName}.settings.json`);
    const settingsPath = candidateSettingsPath || primarySettingsPath;

    // Check if profile directory exists
    if (!candidateSettingsPath) {
      return {
        valid: false,
        error: `Profile not found: ${profileName}`,
        suggestion:
          `Profile settings missing at: ${primarySettingsPath}\n\n` +
          `To set up ${profileName} profile:\n` +
          `  1. Copy base settings: cp config/base-${profileName}.settings.json ~/.ccs/${profileName}.settings.json\n` +
          `  2. Edit settings: Edit ~/.ccs/${profileName}.settings.json\n` +
          `  3. Set your API key in ANTHROPIC_AUTH_TOKEN field`,
      };
    }

    // Read and parse settings.json
    let settings: Settings;
    try {
      const settingsContent = fs.readFileSync(settingsPath, 'utf8');
      settings = JSON.parse(settingsContent);
    } catch (error) {
      return {
        valid: false,
        error: `Failed to parse settings.json for ${profileName}`,
        suggestion:
          `Settings file is corrupted or invalid JSON.\n\n` +
          `Location: ${settingsPath}\n` +
          `Parse error: ${(error as Error).message}\n\n` +
          `Fix: Restore from base config:\n` +
          `  cp config/base-${profileName}.settings.json ~/.ccs/${profileName}.settings.json`,
      };
    }

    // Support both proxy mode (ANTHROPIC_AUTH_TOKEN) and native mode (ANTHROPIC_API_KEY).
    // Profiles without an API key use the instance's claude.ai subscription login.
    const apiKey = settings.env?.ANTHROPIC_AUTH_TOKEN || settings.env?.ANTHROPIC_API_KEY;

    // Check for default placeholder values if an API key is present
    const defaultPlaceholders = [
      'YOUR_GLM_API_KEY_HERE',
      'YOUR_KIMI_API_KEY_HERE',
      'YOUR_API_KEY_HERE',
      'your-api-key-here',
      'PLACEHOLDER',
    ];

    if (apiKey && defaultPlaceholders.some((placeholder) => apiKey.includes(placeholder))) {
      return {
        valid: false,
        error: `Default API key placeholder detected for ${profileName}`,
        suggestion:
          `API key is still set to default placeholder.\n\n` +
          `To configure your profile:\n` +
          `  1. Edit: ${settingsPath}\n` +
          `  2. Replace ANTHROPIC_AUTH_TOKEN with your actual API key\n\n` +
          `Get API key:\n` +
          `  GLM: https://z.ai/manage-apikey/apikey-list\n` +
          `  Kimi: https://platform.moonshot.cn/console/api-keys`,
      };
    }

    // Validation passed
    return {
      valid: true,
      settingsPath,
      apiKey: apiKey ? apiKey.substring(0, 8) + '...' : undefined,
    };
  }

  /**
   * Format validation error for display
   * @param result - Validation result from validate()
   * @returns Formatted error message
   */
  static formatError(result: DelegationValidationResult): string {
    if (result.valid) {
      return '';
    }

    let message = `\n[X] ${result.error}\n\n`;

    if (result.suggestion) {
      message += `${result.suggestion}\n`;
    }

    return message;
  }

  /**
   * Check if profile is delegation-ready (shorthand)
   * @param profileName - Profile to check
   * @returns True if ready for delegation
   */
  static isReady(profileName: string): boolean {
    const result = this.validate(profileName);
    return result.valid;
  }

  /**
   * Get all delegation-ready profiles from config.yaml
   * Only returns profiles explicitly defined in config, not orphan settings files
   * @returns List of profile names ready for delegation
   */
  static getReadyProfiles(): string[] {
    const ccsDir = getCcsDir();
    const configPath = path.join(ccsDir, 'config.yaml');

    if (!fs.existsSync(ccsDir)) {
      return [];
    }

    const profiles: string[] = [];

    // Get profiles from config.yaml (excludes 'default' which uses ~/.claude/settings.json)
    if (fs.existsSync(configPath)) {
      try {
        const yaml = require('js-yaml');
        const content = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(content) as Record<string, unknown>;

        if (config.profiles && typeof config.profiles === 'object') {
          for (const profileName of Object.keys(config.profiles as object)) {
            if (profileName !== 'default' && this.isReady(profileName)) {
              profiles.push(profileName);
            }
          }
        }

        // Also check CLIProxy providers (gemini, codex, agy, etc.)
        if (config.cliproxy && typeof config.cliproxy === 'object') {
          const cliproxy = config.cliproxy as Record<string, unknown>;
          if (Array.isArray(cliproxy.providers)) {
            for (const provider of cliproxy.providers) {
              if (typeof provider === 'string' && this.isReady(provider)) {
                profiles.push(provider);
              }
            }
          }
        }
      } catch {
        // Config parse error, fall back to empty
      }
    }

    return profiles;
  }
}
