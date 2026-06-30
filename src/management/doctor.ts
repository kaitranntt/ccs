/**
 * CCS Health Check and Diagnostics - Main Orchestrator
 */

import { initUI, header, box, table, color, ok, fail, warn, info } from '../utils/ui';
import packageJson from '../../package.json';
import {
  HealthCheck,
  runSystemChecks,
  runEnvironmentCheck,
  runConfigChecks,
  runProfileChecks,
  runSymlinkChecks,
  runCLIProxyChecks,
  runOAuthChecks,
  runImageAnalysisCheck,
} from './checks';
import { runAutoRepair } from './repair';
import { getDockerKeyRotationStatus } from '../docker/docker-key-rotation';
import { maybeShowPoolOnboardingHint } from '../cliproxy/routing/pool-onboarding-hint';

/**
 * Doctor Class - Orchestrates health checks
 */
class Doctor {
  private readonly results: HealthCheck;
  private readonly ccsVersion: string;

  constructor() {
    this.results = new HealthCheck();
    this.ccsVersion = packageJson.version;
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<HealthCheck> {
    await initUI();

    // Hero header box
    console.log(box(`CCS Health Check v${this.ccsVersion}`, { borderStyle: 'round', padding: 0 }));
    console.log('');

    // Store CCS version in details
    this.results.details['CCS Version'] = { status: 'OK', info: `v${this.ccsVersion}` };

    // Group 1: System
    console.log(header('SYSTEM'));
    await this.safe('System Checks', () => runSystemChecks(this.results));
    console.log('');

    // Group 2: Environment (OAuth readiness diagnostics)
    console.log(header('ENVIRONMENT'));
    await this.safe('Environment Check', () => runEnvironmentCheck(this.results));
    console.log('');

    // Group 3: Configuration
    console.log(header('CONFIGURATION'));
    await this.safe('Configuration Checks', () => runConfigChecks(this.results));
    await this.safe('Docker Key Rotation', () => this.runDockerKeyRotationCheck());
    console.log('');

    // Group 4: Profiles & Delegation
    console.log(header('PROFILES & DELEGATION'));
    await this.safe('Profile Checks', () => runProfileChecks(this.results));
    console.log('');

    // Group 5: System Health
    console.log(header('SYSTEM HEALTH'));
    await this.safe('Symlink Checks', () => runSymlinkChecks(this.results));
    console.log('');

    // Group 6: CLIProxy Plus (OAuth profiles)
    console.log(header('CLIPROXY PLUS (OAUTH PROFILES)'));
    await this.safe('CLIProxy Checks', () => runCLIProxyChecks(this.results));
    console.log('');

    // Group 7: OAuth Readiness (port availability)
    console.log(header('OAUTH READINESS'));
    await this.safe('OAuth Checks', () => runOAuthChecks(this.results));
    console.log('');

    // Group 8: Image Analysis Config
    console.log(header('IMAGE ANALYSIS'));
    await this.safe('Image Analysis Check', () => runImageAnalysisCheck(this.results));
    console.log('');

    this.showReport();
    return this.results;
  }

  /**
   * Run one check group defensively. A thrown check (e.g. a corrupt config.yaml
   * that makes a loader throw) is recorded as an error instead of aborting the
   * whole run, so the SUMMARY and ERRORS sections (with recovery hints) always
   * render.
   */
  private async safe(label: string, fn: () => void | Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      // Use only the first line of the message: parser errors (e.g. js-yaml)
      // embed a multi-line snippet that the loader already printed once, so the
      // ERRORS section stays one line per failed check.
      const raw = err instanceof Error ? err.message : String(err);
      const message = raw.split('\n')[0].trim();
      this.results.addCheck(label, 'error', message, undefined, {
        status: 'ERROR',
        info: 'check failed (see ERRORS)',
      });
    }
  }

  /**
   * Show health check report
   */
  private showReport(): void {
    console.log('');
    console.log(header('HEALTH CHECK SUMMARY'));
    console.log('');

    // Build summary table rows
    const rows: string[][] = Object.entries(this.results.details).map(([component, detail]) => {
      const statusIndicator =
        detail.status === 'OK'
          ? color('[OK]', 'success')
          : detail.status === 'ERROR'
            ? color('[X]', 'error')
            : color('[!]', 'warning');

      return [component, statusIndicator, detail.info || ''];
    });

    console.log(
      table(rows, {
        head: ['Component', 'Status', 'Details'],
        colWidths: [20, 12, 35],
      })
    );
    console.log('');

    // Show errors if present
    if (this.results.hasErrors()) {
      console.log(header('ERRORS'));
      this.results.errors.forEach((err) => {
        console.log(`  ${fail(err.name)}: ${err.message}`);
        if (err.fix) {
          console.log(`    Fix: ${color(err.fix, 'command')}`);
        }
      });
      console.log('');
    }

    // Show warnings if present
    if (this.results.hasWarnings()) {
      console.log(header('WARNINGS'));
      this.results.warnings.forEach((w) => {
        console.log(`  ${warn(w.name)}: ${w.message}`);
        if (w.fix) {
          console.log(`    Fix: ${color(w.fix, 'command')}`);
        }
      });
      console.log('');
    }

    // Final status
    if (this.results.isHealthy() && !this.results.hasWarnings()) {
      console.log(ok('All checks passed! Installation is healthy.'));
      console.log('');
      console.log(info(`Tip: Use ${color('ccs config', 'command')} for web-based configuration`));
    } else if (this.results.hasErrors()) {
      console.log(fail('Installation has errors. Run suggested fixes above.'));
    } else {
      console.log(
        ok(
          `Installation healthy (${this.results.warnings.length} warning${this.results.warnings.length !== 1 ? 's' : ''})`
        )
      );
      console.log('');
      console.log(info(`Tip: Use ${color('ccs config', 'command')} for web-based configuration`));
    }

    // Pool onboarding hint: fires when >= 2 native Claude profiles exist and
    // pool routing is not yet enabled.  TTY-gated and never blocks (failures are
    // swallowed inside maybeShowPoolOnboardingHint).  This is the deliberately
    // ungated discovery surface for legacy profiles.json-only installs, which
    // have no config.yaml to persist dismissal: those users may see the hint on
    // every doctor run until they run `ccs migrate` or enable pool routing.
    // Unified installs persist dismissal in config.yaml, so for them it is
    // genuinely once per install.
    maybeShowPoolOnboardingHint();

    console.log('');
  }

  private runDockerKeyRotationCheck(): void {
    const status = getDockerKeyRotationStatus();
    if (status.legacyGraceActive && status.legacyGrace) {
      this.results.addCheck(
        'Docker Key Rotation',
        'warning',
        `Legacy API key remains valid until ${status.legacyGrace.expiresAt}`,
        'Run `ccs docker show-key --full`, update clients, then run `ccs docker finalize-key-rotation`.',
        {
          status: 'WARN',
          info: `legacy key grace active until ${status.legacyGrace.expiresAt}`,
        }
      );
      return;
    }

    if (status.stateCorrupted) {
      this.results.addCheck(
        'Docker Key Rotation',
        'warning',
        'Docker bootstrap state marker is unreadable',
        'Run `ccs docker up` to recreate the marker.',
        {
          status: 'WARN',
          info: 'state marker unreadable',
        }
      );
      return;
    }

    this.results.addCheck(
      'Docker Key Rotation',
      'success',
      'No active legacy API key grace',
      undefined,
      {
        status: 'OK',
        info: 'no active grace',
      }
    );
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        platform: process.platform,
        nodeVersion: process.version,
        ccsVersion: packageJson.version,
        checks: this.results.checks,
        errors: this.results.errors,
        warnings: this.results.warnings,
        healthy: this.results.isHealthy(),
      },
      null,
      2
    );
  }

  /**
   * Fix detected issues (--fix flag)
   */
  async fixIssues(): Promise<void> {
    await runAutoRepair();
  }

  /**
   * Check if the health check results are healthy
   */
  isHealthy(): boolean {
    return this.results.isHealthy();
  }
}

export default Doctor;
