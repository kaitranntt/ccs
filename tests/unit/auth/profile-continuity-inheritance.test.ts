import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as configLoader from '../../../src/config/unified-config-loader';
import ProfileRegistry from '../../../src/auth/profile-registry';
import InstanceManager from '../../../src/management/instance-manager';
import { resolveProfileContinuityInheritance } from '../../../src/auth/profile-continuity-inheritance';

describe('resolveProfileContinuityInheritance', () => {
  afterEach(() => {
    mock.restore();
  });

  it('returns no inheritance for non-claude targets', async () => {
    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'droid',
    });

    expect(result).toEqual({});
  });

  it('resolves mapped account and ensures inherited instance path', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          glm: 'pro',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance').mockResolvedValue(
      '/tmp/.ccs/instances/pro'
    );
    const getProfilesSpy = spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue(
      {
        pro: {
          type: 'account',
          created: '2026-03-01T00:00:00.000Z',
          last_used: null,
          context_mode: 'shared',
          context_group: 'Team Alpha',
          continuity_mode: 'deeper',
        },
      }
    );

    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({
      sourceAccount: 'pro',
      claudeConfigDir: '/tmp/.ccs/instances/pro',
    });
    expect(getProfilesSpy).toHaveBeenCalledTimes(1);
    expect(ensureInstanceSpy).toHaveBeenCalledWith('pro', {
      mode: 'shared',
      group: 'team-alpha',
      continuityMode: 'deeper',
    }, { bare: false });
  });

  it('supports legacy continuity_inherit_from_account fallback', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
    } as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);
    spyOn(configLoader, 'isUnifiedMode').mockReturnValue(false);
    spyOn(configLoader, 'getConfigJsonPath').mockReturnValue('/tmp/ccs-test-config.json');
    spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      return filePath === '/tmp/ccs-test-config.json';
    });
    spyOn(fs, 'readFileSync').mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
      if (filePath === '/tmp/ccs-test-config.json') {
        return JSON.stringify({
          continuity_inherit_from_account: {
            copilot: 'work',
          },
        });
      }
      return '';
    }) as unknown as typeof fs.readFileSync);

    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({
      work: {
        type: 'account',
        created: '2026-03-01T00:00:00.000Z',
        last_used: null,
      },
    });
    spyOn(InstanceManager.prototype, 'ensureInstance').mockResolvedValue('/tmp/.ccs/instances/work');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'copilot',
      profileType: 'copilot',
      target: 'claude',
    });

    expect(result).toEqual({
      sourceAccount: 'work',
      claudeConfigDir: '/tmp/.ccs/instances/work',
    });
  });

  it('returns empty result when mapped source account does not exist', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          glm: 'missing',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({});
    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({});
    expect(ensureInstanceSpy).not.toHaveBeenCalled();
  });

  it('does not read legacy config fallback when unified mode is active', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
    } as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);
    spyOn(configLoader, 'isUnifiedMode').mockReturnValue(true);
    spyOn(configLoader, 'getConfigJsonPath').mockReturnValue('/tmp/ccs-test-config.json');
    const existsSpy = spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      return filePath === '/tmp/ccs-test-config.json';
    });
    const readSpy = spyOn(fs, 'readFileSync').mockImplementation(((
      filePath: fs.PathOrFileDescriptor
    ) => {
      if (filePath === '/tmp/ccs-test-config.json') {
        return JSON.stringify({
          continuity_inherit_from_account: {
            glm: 'pro',
          },
        });
      }
      return '';
    }) as unknown as typeof fs.readFileSync);

    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({});
    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({});
    expect(ensureInstanceSpy).not.toHaveBeenCalled();
    expect(existsSpy).not.toHaveBeenCalled();
    expect(readSpy).not.toHaveBeenCalled();
  });

  it('supports default profile inheritance when explicitly mapped', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          default: 'pro',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);
    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({
      pro: {
        type: 'account',
        created: '2026-03-01T00:00:00.000Z',
        last_used: null,
      },
    });
    spyOn(InstanceManager.prototype, 'ensureInstance').mockResolvedValue('/tmp/.ccs/instances/pro');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'default',
      profileType: 'default',
      target: 'claude',
    });

    expect(result).toEqual({
      sourceAccount: 'pro',
      claudeConfigDir: '/tmp/.ccs/instances/pro',
    });
  });

  it('returns empty result when mapped source exists but is not an account profile', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          glm: 'settings-profile',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({
      'settings-profile': {
        type: 'settings',
        created: '2026-03-01T00:00:00.000Z',
        last_used: null,
      },
    });
    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({});
    expect(ensureInstanceSpy).not.toHaveBeenCalled();
  });

  it('supports profile alias lookup when continuity mapping uses legacy key', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          kimi: 'pro',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({
      pro: {
        type: 'account',
        created: '2026-03-01T00:00:00.000Z',
        last_used: null,
      },
    });
    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance').mockResolvedValue(
      '/tmp/.ccs/instances/pro'
    );

    const result = await resolveProfileContinuityInheritance({
      profileName: 'km',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({
      sourceAccount: 'pro',
      claudeConfigDir: '/tmp/.ccs/instances/pro',
    });
    expect(ensureInstanceSpy).toHaveBeenCalledWith('pro', {
      mode: 'isolated',
    }, { bare: false });
  });

  it('propagates bare source-account mode when inheriting continuity', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          glm: 'pro',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance').mockResolvedValue(
      '/tmp/.ccs/instances/pro'
    );
    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({
      pro: {
        type: 'account',
        created: '2026-03-01T00:00:00.000Z',
        last_used: null,
        bare: true,
      },
    });

    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({
      sourceAccount: 'pro',
      claudeConfigDir: '/tmp/.ccs/instances/pro',
    });
    expect(ensureInstanceSpy).toHaveBeenCalledWith(
      'pro',
      { mode: 'isolated' },
      { bare: true }
    );
  });

  it('does not apply km settings alias mapping to kimi cliproxy profile', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          km: 'pro',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'kimi',
      profileType: 'cliproxy',
      target: 'claude',
    });

    expect(result).toEqual({});
    expect(ensureInstanceSpy).not.toHaveBeenCalled();
  });

  it('does not apply km settings alias mapping to kimi cliproxy profile in legacy mode', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
    } as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);
    spyOn(configLoader, 'isUnifiedMode').mockReturnValue(false);
    spyOn(configLoader, 'getConfigJsonPath').mockReturnValue('/tmp/ccs-test-config.json');
    spyOn(fs, 'existsSync').mockImplementation((filePath) => {
      return filePath === '/tmp/ccs-test-config.json';
    });
    spyOn(fs, 'readFileSync').mockImplementation(((filePath: fs.PathOrFileDescriptor) => {
      if (filePath === '/tmp/ccs-test-config.json') {
        return JSON.stringify({
          continuity_inherit_from_account: {
            km: 'pro',
          },
        });
      }
      return '';
    }) as unknown as typeof fs.readFileSync);

    const ensureInstanceSpy = spyOn(InstanceManager.prototype, 'ensureInstance');

    const result = await resolveProfileContinuityInheritance({
      profileName: 'kimi',
      profileType: 'cliproxy',
      target: 'claude',
    });

    expect(result).toEqual({});
    expect(ensureInstanceSpy).not.toHaveBeenCalled();
  });

  it('fails open when source account instance initialization throws', async () => {
    spyOn(configLoader, 'loadOrCreateUnifiedConfig').mockReturnValue({
      version: 8,
      continuity: {
        inherit_from_account: {
          glm: 'pro',
        },
      },
    } as unknown as ReturnType<typeof configLoader.loadOrCreateUnifiedConfig>);

    spyOn(ProfileRegistry.prototype, 'getAllProfilesMerged').mockReturnValue({
      pro: {
        type: 'account',
        created: '2026-03-01T00:00:00.000Z',
        last_used: null,
      },
    });
    spyOn(InstanceManager.prototype, 'ensureInstance').mockRejectedValue(
      new Error('instance init failed')
    );

    const result = await resolveProfileContinuityInheritance({
      profileName: 'glm',
      profileType: 'settings',
      target: 'claude',
    });

    expect(result).toEqual({});
  });
});
