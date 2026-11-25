/**
 * CLIProxyAPI v8 Config Layout Migration & YAML Section Preservation Helpers
 */

import * as yaml from 'js-yaml';
import { CCS_INTERNAL_API_KEY } from '../../auth/auth-constants';

const V8_REGENERATED_ROOTS = new Set([
  'server',
  'observability',
  'management',
  'routing',
  'access',
  'oauth',
  'requests',
  'quota-exceeded',
]);

const CONDITIONALLY_GENERATED_KEYS = new Set([
  'max-retry-credentials',
  'payload',
  'fallback-chain',
]);

interface TopLevelYamlSection {
  key: string;
  text: string;
}

export interface ExistingV8Config {
  legacyView: string;
  sections: TopLevelYamlSection[];
  hasUpstreamKeyMap: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse user-added API keys from existing config content.
 * Extracts all keys except the internal CCS key for preservation.
 */
export function parseUserApiKeys(content: string): string[] {
  const userKeys: string[] = [];
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');
  let inApiKeysSection = false;

  for (const line of lines) {
    if (line.match(/^api-keys:\s*$/)) {
      inApiKeysSection = true;
      continue;
    }

    if (inApiKeysSection) {
      const keyMatch = line.match(/^\s+-\s*"([^"]*)"/);
      if (keyMatch) {
        const key = keyMatch[1];
        if (key && key !== CCS_INTERNAL_API_KEY) {
          userKeys.push(key);
        }
      } else if (line.match(/^\S/) && line.trim().length > 0) {
        break;
      }
    }
  }

  return userKeys;
}

/**
 * Extract a YAML section from config content by key name.
 */
export function extractYamlSection(content: string, sectionKey: string): string {
  const lines = content.split('\n');
  const sectionLines: string[] = [];
  let inSection = false;

  for (const line of lines) {
    if (line.startsWith(`${sectionKey}:`)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (line.match(/^\S/) && !line.startsWith('#') && line.trim().length > 0) {
        break;
      }
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
}

function splitTopLevelYamlSections(content: string): TopLevelYamlSection[] {
  const sections: TopLevelYamlSection[] = [];
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    const keyMatch = line.match(/^([^\s#][^:]*):/);
    if (keyMatch) {
      sections.push({ key: keyMatch[1], text: line });
    } else if (sections.length > 0) {
      sections[sections.length - 1].text += `\n${line}`;
    }
  }
  return sections.map((section) => ({ ...section, text: section.text.replace(/\s+$/, '') }));
}

export function readExistingV8Config(content: string): ExistingV8Config | null {
  if (!/^config-version:/m.test(content)) {
    return null;
  }
  let doc: unknown;
  try {
    doc = yaml.load(content);
  } catch {
    return null;
  }
  if (!isPlainObject(doc)) {
    return null;
  }
  const root = doc;
  const child = (key: string): Record<string, unknown> => {
    const value = root[key];
    return isPlainObject(value) ? value : {};
  };
  const server = child('server');
  const clientKeys = child('access')['api-keys'] ?? root['api-keys'];
  const view: Record<string, unknown> = {
    host: server.host ?? root.host,
    port: server.port ?? root.port,
    'api-keys': Array.isArray(clientKeys)
      ? clientKeys.filter((key) => typeof key === 'string')
      : undefined,
    'oauth-model-alias': child('oauth')['model-alias'] ?? root['oauth-model-alias'],
    payload: child('requests').payload ?? root.payload,
  };
  const header = content.match(/^(?:#.*\r?\n)*/)?.[0] ?? '';
  const definedView = Object.fromEntries(
    Object.entries(view).filter(([, value]) => value !== undefined && value !== null)
  );

  return {
    legacyView: `${header}${yaml.dump(definedView, { lineWidth: -1, forceQuotes: true, quotingType: '"' })}`,
    sections: splitTopLevelYamlSections(content),
    hasUpstreamKeyMap: isPlainObject(root['api-keys']),
  };
}

function nestClientApiKeysUnderAccess(configContent: string): string {
  return configContent.replace(
    /^api-keys:\n((?:[ \t]+-.*\n)*)/m,
    (_match, items: string) => `access:\n  api-keys:\n${items.replace(/^(?=.)/gm, '  ')}`
  );
}

export function appendKeptV8Sections(configContent: string, existing: ExistingV8Config): string {
  let content = existing.hasUpstreamKeyMap
    ? nestClientApiKeysUnderAccess(configContent)
    : configContent;
  const generatedKeys = new Set(splitTopLevelYamlSections(content).map((section) => section.key));
  for (const section of existing.sections) {
    if (
      !generatedKeys.has(section.key) &&
      !V8_REGENERATED_ROOTS.has(section.key) &&
      !CONDITIONALLY_GENERATED_KEYS.has(section.key)
    ) {
      content += `${section.text}\n`;
    }
  }
  return content;
}
