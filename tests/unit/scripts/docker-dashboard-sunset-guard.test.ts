import { describe, expect, test } from 'bun:test';

const { evaluateDashboardSunset } = require('../../../scripts/docker-dashboard-sunset-guard.js');

describe('docker dashboard sunset guard', () => {
  test('allows the baseline stable release', () => {
    const result = evaluateDashboardSunset({
      targetTag: 'v7.80.0',
      baselineVersion: '7.80.0',
      releaseWindow: 2,
      stableTags: ['v7.79.1', 'v7.80.0'],
    });

    expect(result).toMatchObject({
      elapsed: 0,
      publish: true,
    });
  });

  test('allows the first stable release after the baseline', () => {
    const result = evaluateDashboardSunset({
      targetTag: 'v7.80.1',
      baselineVersion: '7.80.0',
      releaseWindow: 2,
      stableTags: ['v7.79.1', 'v7.80.0', 'v7.80.1'],
    });

    expect(result).toMatchObject({
      elapsed: 1,
      publish: true,
    });
  });

  test('turns the legacy publish into a no-op at the configured sunset boundary', () => {
    const result = evaluateDashboardSunset({
      targetTag: 'v7.80.2',
      baselineVersion: '7.80.0',
      releaseWindow: 2,
      stableTags: ['v7.79.1', 'v7.80.0', 'v7.80.1', 'v7.80.2'],
    });

    expect(result).toMatchObject({
      elapsed: 2,
      publish: false,
    });
  });

  test('skips deprecated publish if the baseline tag is missing after the baseline', () => {
    const result = evaluateDashboardSunset({
      targetTag: 'v7.81.2',
      baselineVersion: '7.81.0',
      releaseWindow: 2,
      stableTags: ['v7.80.0'],
    });

    expect(result).toMatchObject({
      elapsed: 2,
      publish: false,
    });
    expect(result.reason).toContain('baseline v7.81.0 is missing');
  });
});
