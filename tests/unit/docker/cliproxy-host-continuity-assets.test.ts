import { readFileSync } from 'fs';
import { describe, expect, it } from 'bun:test';

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

  it('rolls back failed swaps and health-checks both services', () => {
    expect(updateScript).toContain('rollback()');
    expect(updateScript).toContain('previous-binary');
    expect(updateScript).toContain('wait_for_proxy');
    expect(reconcileScript).toContain('http://127.0.0.1:3000/');
    expect(reconcileScript).toContain('http://127.0.0.1:8317/');
  });

  it('recreates missing containers and escalates unhealthy recovery', () => {
    expect(reconcileScript).toContain('docker compose -f "$compose_file" up -d --no-build');
    expect(reconcileScript).toContain('restart ccs-dashboard cliproxy');
    expect(reconcileScript).toContain('docker restart "$container_name"');
  });

  it('installs executable services on bounded timers', () => {
    expect(updateService).toContain('ExecStart=/opt/cliproxy/ccs-cliproxy-safe-update.sh');
    expect(updateService).toContain('TimeoutStartSec=10min');
    expect(updateTimer).toContain('OnUnitActiveSec=15min');
    expect(reconcileService).toContain('ExecStart=/opt/cliproxy/ccs-cliproxy-reconcile.sh');
    expect(reconcileTimer).toContain('OnUnitActiveSec=30s');
  });
});
