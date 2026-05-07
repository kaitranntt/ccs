/**
 * Constants for Quick Setup Wizard
 * Provider display info with custom ordering for wizard UI.
 * IDs come from the provider-config presentation layer.
 */

import type { ProviderOption } from './types';
import {
  type CLIProxyProvider,
  getProviderDescription,
  getProviderDisplayName,
} from '@/lib/provider-config';

/** Wizard display order - most recommended first */
const WIZARD_PROVIDER_ORDER: CLIProxyProvider[] = [
  'agy',
  'claude',
  'gemini',
  'codex',
  'cursor',
  'gitlab',
  'codebuddy',
  'qwen',
  'kimi',
  'iflow',
  'kilo',
  'kiro',
];

export const PROVIDERS: ProviderOption[] = WIZARD_PROVIDER_ORDER.map((id) => ({
  id,
  name: getProviderDisplayName(id),
  description: getProviderDescription(id),
}));

export const ALL_STEPS = ['provider', 'auth', 'variant', 'success'];

export function getStepProgress(step: string): number {
  if (step === 'account') return 1; // Same as auth
  return ALL_STEPS.indexOf(step);
}
