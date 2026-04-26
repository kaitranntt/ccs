/**
 * Draft utilities for the Claude Extension page.
 *
 * BindingDraft is the local mutable form state that mirrors ClaudeExtensionBindingInput.
 * These helpers convert between the API shape (ClaudeExtensionBinding) and the form shape.
 */
import type {
  ClaudeExtensionBinding,
  ClaudeExtensionBindingInput,
} from '@/hooks/use-claude-extension';

export interface BindingDraft {
  name: string;
  profile: string;
  host: 'vscode' | 'cursor' | 'windsurf';
  ideSettingsPath: string;
  notes: string;
}

export function createEmptyDraft(profile: string): BindingDraft {
  return {
    name: '',
    profile,
    host: 'vscode',
    ideSettingsPath: '',
    notes: '',
  };
}

export function bindingToDraft(binding: ClaudeExtensionBinding): BindingDraft {
  return {
    name: binding.name,
    profile: binding.profile,
    host: binding.host,
    ideSettingsPath: binding.ideSettingsPath ?? '',
    notes: binding.notes ?? '',
  };
}

export function normalizeBindingDraft(draft: BindingDraft): ClaudeExtensionBindingInput {
  return {
    name: draft.name.trim(),
    profile: draft.profile.trim(),
    host: draft.host,
    ideSettingsPath: draft.ideSettingsPath.trim() || undefined,
    notes: draft.notes.trim() || undefined,
  };
}
