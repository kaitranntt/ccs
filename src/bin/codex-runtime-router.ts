/**
 * Codex runtime router — testable logic for src/bin/codex-runtime.ts.
 *
 * All inter-module deps are resolved via require() at call-time so tests can
 * inject stubs via require.cache before calling main().
 *
 * Routing:
 *   argv[2] === 'auth'  → delegate to runCodexAuth(argv.slice(3)), exit with code
 *   else               → resolve active profile, set CODEX_HOME, load ccs
 *                        CCS manages the process lifecycle; entry MUST NOT
 *                        call process.exit() when main returns -1.
 *
 * Return value contract:
 *   ≥ 0  → auth branch: caller should process.exit(code)
 *   -1   → CCS branch: CCS has taken over the process; caller must NOT exit
 */

process.env.CCS_INTERNAL_ENTRY_TARGET = 'codex';

function isCodexAuthProfileResolutionError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'CodexAuthProfileResolutionError'
  );
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(err);
}

/**
 * Main entry-point for the ccsx / codex-runtime binary.
 *
 * @param argv - process.argv (or test-supplied equivalent)
 * @returns ≥0 exit code for auth branch; -1 for CCS branch (no exit needed)
 */
export async function main(argv: string[]): Promise<number> {
  const subcommand = argv[2];

  // ── auth branch ─────────────────────────────────────────────────────────
  if (subcommand === 'auth') {
    const { runCodexAuth } = require('../codex-auth/codex-auth-router') as {
      runCodexAuth: (args: string[]) => Promise<number>;
    };
    return runCodexAuth(argv.slice(3));
  }

  // ── non-auth branch: profile resolution ─────────────────────────────────

  // F1: respect explicit CODEX_HOME unless CCS_CODEX_PROFILE asks for a managed profile.
  const explicit = (process.env.CODEX_HOME ?? '').trim();
  const profileOverride = (process.env.CCS_CODEX_PROFILE ?? '').trim();
  if (!explicit || profileOverride) {
    try {
      const { resolveActiveProfile } = require('../codex-auth/resolve-active-profile') as {
        resolveActiveProfile: (
          env: NodeJS.ProcessEnv
        ) => { name: string; dir: string; source: string } | null;
      };
      const resolved = resolveActiveProfile(process.env);
      if (resolved) {
        if (explicit && explicit !== resolved.dir) {
          process.stderr.write(
            `[!] codex-auth: CCS_CODEX_PROFILE=${profileOverride} overrides existing CODEX_HOME.\n`
          );
        }
        process.env.CODEX_HOME = resolved.dir;

        try {
          const { ensureSharedConfigSymlink } = require('../codex-auth/codex-config-symlink') as {
            ensureSharedConfigSymlink: (dir: string) => void;
          };
          ensureSharedConfigSymlink(resolved.dir);
        } catch (symlinkErr) {
          const msg = symlinkErr instanceof Error ? symlinkErr.message : String(symlinkErr);
          process.stderr.write(
            `[!] codex-auth: shared config symlink failed (${msg}), continuing\n`
          );
        }
      }
    } catch (resolverErr) {
      const msg = errorMessage(resolverErr);
      if (isCodexAuthProfileResolutionError(resolverErr)) {
        process.stderr.write(`[X] codex-auth: ${msg}\n`);
        return 1;
      }
      process.stderr.write(`[X] codex-auth: profile resolution failed (${msg})\n`);
      return 1;
    }
  }

  // ── delegate to CCS ─────────────────────────────────────────────────────
  // require() is evaluated AFTER env mutations above. CCS manages its own
  // process lifecycle (spawns codex, pipes stdio, calls process.exit).
  // Return -1 so the entry script knows NOT to call process.exit().
  require('../ccs');

  return -1; // CCS is in control — entry must not call process.exit()
}
