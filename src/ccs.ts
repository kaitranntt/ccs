import './utils/fetch-proxy-setup';

import { ErrorManager } from './utils/error-manager';
import { fail } from './utils/ui';
// Import centralized error handling
import { handleError, runCleanup } from './errors';

import { createLogger, runWithRequestId } from './services/logging';
// Import target adapter system
import { registerTarget, ClaudeAdapter, DroidAdapter, CodexAdapter } from './targets';

// Import extracted dispatcher modules
import { bootstrapAndParseEarlyCli } from './dispatcher/cli-argument-parser';
import { type ProfileError, dispatchProfile } from './dispatcher/target-executor';
import { runPreDispatchHandlers } from './dispatcher/pre-dispatch';
import { resolveProfileAndTarget } from './dispatcher/profile-resolver';

// ========== Main Execution ==========

async function main(): Promise<void> {
  // Register target adapters (singleton wiring — stays in main)
  registerTarget(new ClaudeAdapter());
  registerTarget(new DroidAdapter());
  registerTarget(new CodexAdapter());
  const cliLogger = createLogger('cli');

  // Phase A: bootstrap + early arg pre-parse
  const bootstrap = await bootstrapAndParseEarlyCli(process.argv.slice(2));
  if (bootstrap.exitNow) {
    return;
  }

  const args = bootstrap.args;
  const browserLaunchOverride = bootstrap.browserLaunchOverride;

  cliLogger.info('command.start', 'CLI invocation started', {
    command: args[0] || 'default',
    argCount: args.length,
    flags: args.filter((arg) => arg.startsWith('-')).slice(0, 20),
  });

  // Phase B: pre-dispatch side-effects (update check, migrate, recovery, root commands, routing)
  const preDispatchConsumed = await runPreDispatchHandlers({ args, cliLogger });
  if (preDispatchConsumed) {
    return;
  }

  // Phase C: profile + target detection (extracted to dispatcher/profile-resolver.ts)
  const resolvedProfile = await resolveProfileAndTarget({ args, browserLaunchOverride, cliLogger });
  const { profile, profileInfo, resolvedTarget, nativeClaudeRemainingArgs } = resolvedProfile;

  // Dynamic imports needed by Phase E flows — preserve original load ordering.
  const InstanceManagerModule = await import('./management/instance-manager');
  const InstanceManager = InstanceManagerModule.default;
  const ProfileRegistryModule = await import('./auth/profile-registry');
  const ProfileRegistry = ProfileRegistryModule.default;
  const AccountContextModule = await import('./auth/account-context');
  const { resolveAccountContextPolicy, isAccountContextMetadata } = AccountContextModule;
  const ProfileContinuityModule = await import('./auth/profile-continuity-inheritance');
  const { resolveProfileContinuityInheritance } = ProfileContinuityModule;

  // Build full dispatch context (Phase E)
  const dispatchCtx = {
    ...resolvedProfile,
    InstanceManager,
    ProfileRegistry,
    resolveAccountContextPolicy,
    isAccountContextMetadata,
    resolveProfileContinuityInheritance,
  };

  try {
    // Special case: headless delegation (-p/--prompt)
    // Keep existing behavior for Claude targets only; non-claude targets must continue
    // through normal adapter dispatch logic.
    if (args.some((arg) => arg === '-p' || arg === '--prompt' || arg.startsWith('--prompt='))) {
      const shouldUseDelegation = resolvedTarget === 'claude' && profileInfo.type === 'settings';
      if (shouldUseDelegation) {
        const { DelegationHandler } = await import('./delegation/delegation-handler');
        const handler = new DelegationHandler();
        await handler.route([profile, ...nativeClaudeRemainingArgs]);
        return;
      }
    }

    // Phase E: dispatch to per-profile-type flow (all 6 branches now live in flows/)
    await dispatchProfile(dispatchCtx);
  } catch (error) {
    const err = error as ProfileError;
    // Check if this is a profile not found error with suggestions
    if (err.profileName && err.availableProfiles !== undefined) {
      const allProfiles = err.availableProfiles.split('\n');
      await ErrorManager.showProfileNotFound(err.profileName, allProfiles, err.suggestions);
    } else {
      console.error(fail(err.message));
    }
    process.exit(1);
  }
}

// ========== Global Error Handlers ==========

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  handleError(error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  handleError(reason);
});

// Handle process termination signals for cleanup
process.on('SIGTERM', () => {
  try {
    runCleanup();
  } catch {
    // Cleanup failure should not block termination.
  }
  // If a target exec path registered additional signal listeners, let those
  // listeners forward/coordinate child shutdown and final exit codes.
  if (process.listenerCount('SIGTERM') <= 1) {
    process.exit(143); // 128 + SIGTERM(15)
  }
});

process.on('SIGINT', () => {
  try {
    runCleanup();
  } catch {
    // Cleanup failure should not block termination.
  }
  // Same coordination rule as SIGTERM.
  if (process.listenerCount('SIGINT') <= 1) {
    process.exit(130); // 128 + SIGINT(2)
  }
});

// Run main inside a per-invocation request context so all backend logging
// emitted during this CLI run shares a single requestId. CLI text output
// (stdout/stderr) is unaffected — the requestId lives in logs only.
const cliEntryStartedAt = Date.now();
const cliEntryLogger = createLogger('cli:entry');
runWithRequestId(() => {
  cliEntryLogger.stage('intake', 'cli.command.start', 'CLI invocation started', {
    argv: process.argv.slice(2),
  });
  return main()
    .then(() => {
      cliEntryLogger.stage(
        'respond',
        'cli.command.complete',
        'CLI invocation completed',
        { exitCode: process.exitCode ?? 0 },
        { latencyMs: Date.now() - cliEntryStartedAt }
      );
    })
    .catch((err) => {
      const error =
        err instanceof Error
          ? { name: err.name, message: err.message, stack: err.stack }
          : { name: 'Error', message: String(err) };
      cliEntryLogger.stage('cleanup', 'cli.command.failed', 'CLI invocation failed', undefined, {
        level: 'error',
        latencyMs: Date.now() - cliEntryStartedAt,
        error,
      });
      handleError(err);
    });
});
