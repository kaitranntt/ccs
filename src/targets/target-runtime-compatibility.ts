import type { CLIProxyProvider } from '../cliproxy/types';
import type { ProfileType } from '../types/profile';
import type { TargetType } from './target-adapter';

export interface TargetRuntimeCompatibilityInput {
  target: TargetType;
  profileType: ProfileType;
  cliproxyProvider?: CLIProxyProvider;
  cliproxyBridgeProvider?: CLIProxyProvider | null;
  isComposite?: boolean;
}

export interface TargetRuntimeCompatibilityResult {
  supported: boolean;
  reason?: string;
  suggestion?: string;
}

function unsupported(reason: string, suggestion?: string): TargetRuntimeCompatibilityResult {
  return { supported: false, reason, suggestion };
}

export function evaluateTargetRuntimeCompatibility(
  input: TargetRuntimeCompatibilityInput
): TargetRuntimeCompatibilityResult {
  if (input.target === 'claude') {
    return { supported: true };
  }

  if (input.target === 'droid') {
    if (input.profileType === 'account') {
      return unsupported(
        'Factory Droid does not support account-based Claude profiles.',
        'Use a settings-based profile with --target droid instead.'
      );
    }
    if (input.profileType === 'copilot') {
      return unsupported('Factory Droid does not support Copilot profiles.');
    }
    if (input.profileType === 'cursor') {
      return unsupported('Factory Droid does not support Cursor local-proxy profiles.');
    }
    return { supported: true };
  }

  if (input.profileType === 'account') {
    return unsupported(
      'Codex CLI does not support Claude account-based profiles.',
      'Use native Codex auth with: ccs --target codex'
    );
  }

  if (input.profileType === 'copilot') {
    return unsupported('Codex CLI does not support Copilot profiles.');
  }

  if (input.profileType === 'cursor') {
    return unsupported('Codex CLI does not support Cursor local-proxy profiles.');
  }

  if (input.profileType === 'default') {
    return { supported: true };
  }

  if (input.profileType === 'cliproxy') {
    if (input.isComposite) {
      return unsupported(
        'Codex CLI currently does not support composite CLIProxy variants.',
        'Use a Codex-only CLIProxy profile or stay on Claude/Droid for composite variants.'
      );
    }
    if (input.cliproxyProvider !== 'codex') {
      return unsupported(
        `Codex CLI only supports CLIProxy provider "codex". This profile routes to "${input.cliproxyProvider || 'unknown'}".`,
        'Use: ccsxp, ccs codex --target codex, or stay on Claude/Droid for other providers.'
      );
    }
    return { supported: true };
  }

  if (input.profileType === 'settings') {
    if (input.cliproxyBridgeProvider === 'codex') {
      return { supported: true };
    }
    if (input.cliproxyBridgeProvider) {
      return unsupported(
        `Codex CLI only supports CLIProxy Codex bridge profiles. This API profile bridges "${input.cliproxyBridgeProvider}".`,
        'Create a Codex bridge with: ccs api create --cliproxy-provider codex'
      );
    }
    return unsupported(
      'Codex CLI currently supports native default sessions and Codex-routed CLIProxy sessions only.',
      'Use Claude/Droid for generic API profiles, or create a Codex bridge with: ccs api create --cliproxy-provider codex'
    );
  }

  return unsupported('Unsupported Codex runtime combination.');
}
