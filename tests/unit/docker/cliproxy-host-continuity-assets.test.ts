import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { spawnSync } from 'child_process';
import { describe, expect, it } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';

const updateScript = readFileSync('docker/host/ccs-cliproxy-safe-update.sh', 'utf8');
const reconcileScript = readFileSync('docker/host/ccs-cliproxy-reconcile.sh', 'utf8');
const updateService = readFileSync('docker/host/systemd/ccs-cliproxy-update.service', 'utf8');
const updateTimer = readFileSync('docker/host/systemd/ccs-cliproxy-update.timer', 'utf8');
const reconcileService = readFileSync('docker/host/systemd/ccs-cliproxy-reconcile.service', 'utf8');
const reconcileTimer = readFileSync('docker/host/systemd/ccs-cliproxy-reconcile.timer', 'utf8');

describe('CLIProxy Docker host continuity assets', () => {
  it('stages and validates the replacement before stopping the live proxy', () => {
    const stageIndex = updateScript.indexOf('CCS_DIR="$stage_ccs_dir" ccs cliproxy --latest');
    const validateIndex = updateScript.indexOf('"$stage_binary" --version');
    const stopIndex = updateScript.indexOf('supervisorctl_cmd stop cliproxy', validateIndex);

    expect(stageIndex).toBeGreaterThan(-1);
    expect(validateIndex).toBeGreaterThan(stageIndex);
    expect(stopIndex).toBeGreaterThan(validateIndex);
  });

  it('serializes updates and reconciliation with the same lock', () => {
    expect(updateScript).toContain('/run/lock/ccs-cliproxy-maintenance.lock');
    expect(reconcileScript).toContain('/run/lock/ccs-cliproxy-maintenance.lock');
    expect(updateScript).toContain('flock -n 9');
    expect(reconcileScript).toContain('flock -n 9');
  });

  it('shares the in-container install lifecycle lock with CLI and dashboard installs', () => {
    expect(updateScript).toContain(
      "install_lock_target='/root/.ccs/cliproxy/bin/.install-lifecycle-plus'"
    );
    expect(updateScript).toContain('install_lock_dir="$install_lock_target.lock"');
    expect(updateScript).toContain('while ! mkdir "$install_lock_dir"');
    expect(updateScript).toContain('touch "$install_lock_dir"');
    expect(updateScript).toContain('install_lock_stale_seconds=600');
    expect(updateScript).toContain('remove_stale_install_lock');
    expect(updateScript).toContain('rmdir "$install_lock_dir"');
    expect(updateScript.indexOf('acquire_install_lock')).toBeLessThan(
      updateScript.indexOf('supervisorctl_cmd stop cliproxy')
    );
  });

  it('reclaims an orphaned stale lifecycle lock', () => {
    const testRoot = mkdtempSync(join(tmpdir(), 'ccs-cliproxy-host-lock-'));
    const helpersStart = updateScript.indexOf('remove_stale_install_lock() {');
    const helpersEnd = updateScript.indexOf('\nwait_for_proxy() {');
    const helpers = updateScript.slice(helpersStart, helpersEnd);
    try {
      const result = spawnSync(
        'bash',
        [
          '-c',
          `set -Eeuo pipefail
install_lock_target="$1/target"
install_lock_dir="$install_lock_target.lock"
install_lock_stale_seconds=600
install_lock_owned=0
mkdir -p "$install_lock_target" "$install_lock_dir"
touch -t 200001010000 "$install_lock_dir"
${helpers}
acquire_install_lock
test "$install_lock_owned" -eq 1
release_install_lock`,
          'test-shell',
          testRoot,
        ],
        { encoding: 'utf8' }
      );

      expect(result.status).toBe(0);
    } finally {
      rmSync(testRoot, { recursive: true, force: true });
    }
  });

  it('rolls back failed swaps and health-checks both services', () => {
    expect(updateScript).toContain('rollback()');
    expect(updateScript).toContain('previous-binary');
    expect(updateScript).toContain('wait_for_proxy');
    expect(reconcileScript).toContain('http://127.0.0.1:3000/');
    expect(reconcileScript).toContain('http://127.0.0.1:8317/');
  });

  it('recreates missing containers and escalates unhealthy recovery', () => {
    expect(reconcileScript).toContain('CCS_CLIPROXY_COMPOSE_DIR:-/opt/cliproxy');
    expect(reconcileScript).toContain('CCS_CLIPROXY_COMPOSE_PROJECT:-docker');
    expect(reconcileScript).toContain('--project-name "$compose_project"');
    expect(reconcileScript).toContain('-f "$compose_file" up -d --no-build');
    expect(reconcileScript).toContain('restart ccs-dashboard cliproxy');
    expect(reconcileScript).toContain('docker restart "$container_name"');
    expect(reconcileScript).toContain('up -d --force-recreate --no-build');
    expect(reconcileScript.indexOf('docker restart "$container_name"')).toBeGreaterThan(
      reconcileScript.indexOf('restart ccs-dashboard cliproxy')
    );
  });

  it('installs executable services on bounded timers', () => {
    expect(updateService).toContain('ExecStart=/opt/cliproxy/ccs-cliproxy-safe-update.sh');
    expect(updateService).toContain('TimeoutStartSec=10min');
    expect(updateTimer).toContain('OnUnitActiveSec=15min');
    expect(reconcileService).toContain('ExecStart=/opt/cliproxy/ccs-cliproxy-reconcile.sh');
    expect(reconcileTimer).toContain('OnUnitActiveSec=30s');
  });

  it('forces nonzero signal exits so the EXIT trap rolls back maintenance', () => {
    expect(updateScript).toContain("trap 'exit 130' INT");
    expect(updateScript).toContain("trap 'exit 143' TERM");
    expect(updateScript).toContain("trap 'exit 129' HUP");

    const handlerStart = updateScript.indexOf('on_exit() {');
    const handlerEnd = updateScript.indexOf('\ntrap on_exit EXIT');
    const handlers = updateScript.slice(handlerStart, handlerEnd);
    const result = spawnSync(
      'bash',
      [
        '-c',
        `set -Eeuo pipefail
maintenance_started=1
stage_root=/tmp/unused
rollback() { printf 'rollback\\n'; }
cleanup() { printf 'cleanup\\n'; }
release_install_lock() { :; }
${handlers}
trap on_exit EXIT
trap 'exit 143' TERM
true
kill -TERM $$`,
      ],
      { encoding: 'utf8' }
    );

    expect(result.status).toBe(143);
    expect(result.stdout).toContain('rollback');
    expect(result.stdout).toContain('cleanup');
  });
});
