/**
 * Regression: `ccs <cliproxy-provider> --browser` / `--no-browser`.
 *
 * The bootstrap parser strips the browser flags from argv before dispatch, so
 * the CLIProxy executor can no longer read them from its own args. The flow
 * must forward the already-resolved override through ExecutorConfig.
 *
 * spyOn (restored per test) instead of mock.module: the fast bucket shares one
 * bun process, and module mocks would leak into unrelated suites.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as cliproxy from '../../cliproxy';
import * as portManager from '../../cliproxy/config/port-manager';
import * as imageAnalysis from '../../utils/image-analysis';
import * as imageAnalyzerHooks from '../../utils/hooks/image-analyzer-profile-hook-injector';
import type { BrowserLaunchOverride } from '../../utils/browser/browser-policy';
import type { ProfileDispatchContext } from '../dispatcher-context';
import { runCliproxyFlow } from '../flows/cliproxy-flow';

type Spy = { mockRestore: () => void };

function makeContext(override: BrowserLaunchOverride | undefined): ProfileDispatchContext {
  return {
    profileInfo: { type: 'cliproxy', name: 'gemini', provider: 'gemini' },
    resolvedTarget: 'claude',
    claudeCli: '/usr/bin/claude',
    targetAdapter: null,
    targetRemainingArgs: [],
    runtimeReasoningOverride: undefined,
    codexRuntimeConfigOverrides: [],
    remainingArgs: ['-p', 'hi'],
    claudeBrowserExposure:
      override === undefined
        ? undefined
        : { enabled: true, policy: 'manual', exposeForLaunch: true, override },
  } as unknown as ProfileDispatchContext;
}

describe('runCliproxyFlow browser override', () => {
  let execSpy: ReturnType<typeof spyOn>;
  let spies: Spy[] = [];

  beforeEach(() => {
    execSpy = spyOn(cliproxy, 'execClaudeWithCLIProxy').mockResolvedValue(undefined);
    spies = [
      execSpy,
      spyOn(imageAnalysis, 'ensureImageAnalysisMcpOrThrow').mockReturnValue(true),
      spyOn(imageAnalyzerHooks, 'removeImageAnalysisProfileHook').mockReturnValue(true),
      spyOn(portManager, 'resolveLifecyclePort').mockReturnValue(8317),
    ];
  });

  afterEach(() => {
    for (const spy of spies) spy.mockRestore();
    spies = [];
  });

  it.each(['force-enable', 'force-disable'] as const)(
    'forwards %s to the executor',
    async (override) => {
      await runCliproxyFlow(makeContext(override));

      expect(execSpy).toHaveBeenCalledTimes(1);
      const [, provider, args, cfg] = execSpy.mock.calls[0];
      expect(provider).toBe('gemini');
      expect(args).toEqual(['-p', 'hi']);
      expect(cfg.browserLaunchOverride).toBe(override);
    }
  );

  it('leaves the override unset when no browser flag was passed', async () => {
    await runCliproxyFlow(makeContext(undefined));

    expect(execSpy).toHaveBeenCalledTimes(1);
    expect(execSpy.mock.calls[0][3].browserLaunchOverride).toBeUndefined();
  });
});
