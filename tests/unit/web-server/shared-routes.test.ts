import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'http';
import { sharedRoutes } from '../../../src/web-server/shared-routes';

function createDirectorySymlink(targetDir: string, linkPath: string): void {
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';

  try {
    fs.symlinkSync(targetDir, linkPath, symlinkType as fs.symlink.Type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      throw new Error(
        `Symlink creation is not permitted in this environment (${code}) for ${linkPath}`
      );
    }
    throw error;
  }
}

function createFileSymlink(targetFile: string, linkPath: string): void {
  const symlinkType = process.platform === 'win32' ? 'file' : 'file';

  try {
    fs.symlinkSync(targetFile, linkPath, symlinkType as fs.symlink.Type);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EPERM' || code === 'EACCES') {
      throw new Error(
        `File symlink creation is not permitted in this environment (${code}) for ${linkPath}`
      );
    }
    throw error;
  }
}

async function getJson<T>(baseUrl: string, routePath: string): Promise<T> {
  const response = await fetch(`${baseUrl}${routePath}`);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

describe('web-server shared-routes', () => {
  let server: Server;
  let baseUrl = '';
  let tempHome: string;
  let ccsDir: string;
  let originalCcsHome: string | undefined;
  let originalClaudeConfigDir: string | undefined;

  beforeAll(async () => {
    const app = express();
    app.use('/api/shared', sharedRoutes);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1');
      const handleError = (error: Error) => {
        reject(error);
      };

      server.once('error', handleError);
      server.once('listening', () => {
        server.off('error', handleError);
        resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to resolve test server port');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-shared-routes-test-'));
    originalCcsHome = process.env.CCS_HOME;
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CCS_HOME = tempHome;
    delete process.env.CLAUDE_CONFIG_DIR;

    ccsDir = path.join(tempHome, '.ccs');
    fs.mkdirSync(path.join(ccsDir, 'shared'), { recursive: true });
  });

  afterEach(() => {
    if (originalCcsHome !== undefined) {
      process.env.CCS_HOME = originalCcsHome;
    } else {
      delete process.env.CCS_HOME;
    }

    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }

    if (tempHome && fs.existsSync(tempHome)) {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('lists symlinked skill directories', async () => {
    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(sharedSkillsDir, { recursive: true });
    const targetDir = path.join(ccsDir, '.claude', 'skills', 'my-skill');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(
      path.join(targetDir, 'SKILL.md'),
      [
        '---',
        'name: my-skill',
        'description: This skill handles daily maintenance workflows.',
        '---',
        '',
        '# My Skill',
        '',
        'My test skill body',
      ].join('\n')
    );

    const linkPath = path.join(sharedSkillsDir, 'my-skill');
    createDirectorySymlink(targetDir, linkPath);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/skills');

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: 'my-skill',
      type: 'skill',
    });
    expect(payload.items[0].description).toBe('This skill handles daily maintenance workflows.');
    expect(payload.items[0].path).toBe(linkPath);
  });

  it('lists symlinked agent directories', async () => {
    const sharedAgentsDir = path.join(ccsDir, 'shared', 'agents');
    fs.mkdirSync(sharedAgentsDir, { recursive: true });
    const targetDir = path.join(ccsDir, '.claude', 'agents', 'my-agent');
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'prompt.md'), 'My test agent prompt');

    const linkPath = path.join(sharedAgentsDir, 'my-agent');
    createDirectorySymlink(targetDir, linkPath);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/agents');

    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]).toMatchObject({
      name: 'my-agent',
      type: 'agent',
    });
    expect(payload.items[0].description.length).toBeGreaterThan(0);
    expect(payload.items[0].path).toBe(linkPath);
  });

  it('lists file-based agents from symlinked ~/.claude/agents directory', async () => {
    const sharedAgentsDir = path.join(ccsDir, 'shared', 'agents');
    const claudeAgentsDir = path.join(ccsDir, '.claude', 'agents');
    fs.mkdirSync(claudeAgentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeAgentsDir, 'planner.md'),
      [
        '---',
        'description: Plans implementation phases and dependencies.',
        '---',
        '',
        '# Planner',
      ].join('\n')
    );
    createDirectorySymlink(claudeAgentsDir, sharedAgentsDir);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/agents');

    expect(payload.items).toEqual([
      {
        name: 'planner',
        type: 'agent',
        description: 'Plans implementation phases and dependencies.',
        path: path.join(sharedAgentsDir, 'planner.md'),
      },
    ]);
  });

  it('lists command markdown files recursively', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(path.join(commandsDir, 'mkt'), { recursive: true });
    fs.mkdirSync(path.join(commandsDir, 'engineer'), { recursive: true });

    fs.writeFileSync(
      path.join(commandsDir, 'mkt', 'campaign.md'),
      '# Campaign\n\nDraft campaign brief'
    );
    fs.writeFileSync(
      path.join(commandsDir, 'engineer', 'review.md'),
      ['---', 'description: Code review command for engineering workflows.', '---'].join('\n')
    );

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'engineer/review',
        type: 'command',
        description: 'Code review command for engineering workflows.',
        path: path.join(commandsDir, 'engineer', 'review.md'),
      },
      {
        name: 'mkt/campaign',
        type: 'command',
        description: 'Draft campaign brief',
        path: path.join(commandsDir, 'mkt', 'campaign.md'),
      },
    ]);
  });

  it('returns an empty command list when shared commands directory is missing', async () => {
    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([]);
  });

  it('returns full content for a shared command markdown file', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    const commandPath = path.join(commandsDir, 'review.md');
    fs.writeFileSync(commandPath, '# Review\n\nDetailed workflow steps');

    const payload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=commands&path=${encodeURIComponent(commandPath)}`
    );

    expect(payload.content).toContain('Detailed workflow steps');
    expect(payload.contentPath).toBe(fs.realpathSync(commandPath));
  });

  it('returns full content for a shared skill from SKILL.md', async () => {
    const skillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const skillTargetDir = path.join(ccsDir, '.claude', 'skills', 'planner-skill');
    fs.mkdirSync(skillTargetDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillTargetDir, 'SKILL.md'),
      [
        '---',
        'description: Plan things',
        '---',
        '',
        '# Planner Skill',
        '',
        'Full skill details',
      ].join('\n')
    );

    const linkPath = path.join(skillsDir, 'planner-skill');
    createDirectorySymlink(skillTargetDir, linkPath);

    const payload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=skills&path=${encodeURIComponent(linkPath)}`
    );

    expect(payload.content).toContain('Full skill details');
    expect(payload.contentPath).toBe(fs.realpathSync(path.join(skillTargetDir, 'SKILL.md')));
  });

  it('hides plugin infrastructure directories when no plugins are installed', async () => {
    const pluginsDir = path.join(ccsDir, 'shared', 'plugins');
    const cacheDir = path.join(pluginsDir, 'cache');
    fs.mkdirSync(path.join(cacheDir, 'payloads'), { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'plugin-index.json'), '{}');
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: {} }, null, 2)
    );

    const listPayload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/plugins');

    expect(listPayload.items).toEqual([]);

    const contentResponse = await fetch(
      `${baseUrl}/api/shared/content?type=plugins&path=${encodeURIComponent(cacheDir)}`
    );

    expect(contentResponse.status).toBe(404);
    const contentPayload = (await contentResponse.json()) as { error: string };
    expect(contentPayload.error).toBe('Shared content not found');
  });

  it('lists installed plugins from the shared plugin registry', async () => {
    const pluginsDir = path.join(ccsDir, 'shared', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify(
        {
          version: 2,
          plugins: {
            'discord@claude-plugins-official': [
              {
                installPath: path.join(pluginsDir, 'cache', 'discord'),
                enabled: true,
              },
            ],
          },
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(pluginsDir, 'known_marketplaces.json'),
      JSON.stringify(
        {
          'claude-plugins-official': {
            source: { type: 'github', repo: 'anthropics/claude-plugins' },
            installLocation: path.join(pluginsDir, 'marketplaces', 'claude-plugins-official'),
          },
        },
        null,
        2
      )
    );

    const listPayload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/plugins');

    expect(listPayload.items).toEqual([
      {
        name: 'discord@claude-plugins-official',
        type: 'plugin',
        description: 'Installed from claude-plugins-official; 1 record in shared registry',
        path: 'plugin-registry:discord%40claude-plugins-official',
      },
    ]);

    const contentPayload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=plugins&path=${encodeURIComponent(listPayload.items[0].path)}`
    );

    expect(contentPayload.content).toContain('# discord@claude-plugins-official');
    expect(contentPayload.content).toContain('## Marketplace Registry Entry');
    expect(contentPayload.content).toContain('## Plugin Registry Entry');
    expect(contentPayload.contentPath).toBe(
      fs.realpathSync(path.join(pluginsDir, 'installed_plugins.json'))
    );
  });

  it('rejects plugin registry prototype keys as plugin names', async () => {
    const pluginsDir = path.join(ccsDir, 'shared', 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins: {} }, null, 2)
    );

    const response = await fetch(
      `${baseUrl}/api/shared/content?type=plugins&path=${encodeURIComponent('plugin-registry:toString')}`
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Shared content not found');
  });

  it('returns real shared settings content when settings.json is present', async () => {
    const settingsPath = path.join(ccsDir, 'shared', 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: { ANTHROPIC_MODEL: 'claude-sonnet-4-5' },
          permissions: { allow: ['Bash(git status)'] },
        },
        null,
        2
      )
    );

    const summaryPayload = await getJson<{ settings: boolean; total: number }>(
      baseUrl,
      '/api/shared/summary'
    );
    expect(summaryPayload.settings).toBe(true);
    expect(summaryPayload.total).toBe(1);

    const contentPayload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=settings&path=${encodeURIComponent('settings.json')}`
    );

    expect(contentPayload.content).toContain('"ANTHROPIC_MODEL": "claude-sonnet-4-5"');
    expect(contentPayload.content).toContain('"allow"');
    expect(contentPayload.contentPath).toBe(fs.realpathSync(settingsPath));
  });

  it('returns shared settings content when settings.json links to the Claude config file', async () => {
    const claudeDir = path.join(tempHome, '.claude');
    process.env.CLAUDE_CONFIG_DIR = claudeDir;
    fs.mkdirSync(claudeDir, { recursive: true });

    const claudeSettingsPath = path.join(claudeDir, 'settings.json');
    fs.writeFileSync(
      claudeSettingsPath,
      JSON.stringify({ hooks: { PreToolUse: [] }, env: { ANTHROPIC_MODEL: 'claude-opus-4-1' } })
    );

    const sharedSettingsPath = path.join(ccsDir, 'shared', 'settings.json');
    createFileSymlink(claudeSettingsPath, sharedSettingsPath);

    const summaryPayload = await getJson<{ settings: boolean; total: number }>(
      baseUrl,
      '/api/shared/summary'
    );
    expect(summaryPayload.settings).toBe(true);
    expect(summaryPayload.total).toBe(1);

    const contentPayload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=settings&path=${encodeURIComponent('settings.json')}`
    );

    expect(contentPayload.content).toContain('"ANTHROPIC_MODEL": "claude-opus-4-1"');
    expect(contentPayload.contentPath).toBe(fs.realpathSync(claudeSettingsPath));
  });

  it('rejects shared settings content when settings.json resolves outside the shared directory', async () => {
    const settingsPath = path.join(ccsDir, 'shared', 'settings.json');
    const outsideSettingsPath = path.join(tempHome, 'outside-settings.json');
    fs.writeFileSync(outsideSettingsPath, '{"env":{"SECRET":"do-not-read"}}');
    createFileSymlink(outsideSettingsPath, settingsPath);

    const response = await fetch(
      `${baseUrl}/api/shared/content?type=settings&path=${encodeURIComponent('settings.json')}`
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Shared content not found');
  });

  it('rejects shared settings symlinks to non-settings files inside the Claude config directory', async () => {
    const claudeDir = path.join(tempHome, '.claude');
    process.env.CLAUDE_CONFIG_DIR = claudeDir;
    fs.mkdirSync(claudeDir, { recursive: true });

    const otherClaudeFile = path.join(claudeDir, 'credentials.json');
    fs.writeFileSync(otherClaudeFile, '{"SECRET":"do-not-read"}');
    createFileSymlink(otherClaudeFile, path.join(ccsDir, 'shared', 'settings.json'));

    const response = await fetch(
      `${baseUrl}/api/shared/content?type=settings&path=${encodeURIComponent('settings.json')}`
    );

    expect(response.status).toBe(404);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Shared content not found');
  });

  it('returns README content for a shared plugin directory when available', async () => {
    const pluginsDir = path.join(ccsDir, 'shared', 'plugins');
    const pluginDir = path.join(pluginsDir, 'legacy-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'README.md'), '# Plugin Marketplace\n\nShared docs');

    const payload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=plugins&path=${encodeURIComponent(pluginDir)}`
    );

    expect(payload.content).toContain('Shared docs');
    expect(payload.contentPath).toBe(fs.realpathSync(path.join(pluginDir, 'README.md')));
  });

  it('does not use markdown frontmatter fences as descriptions when frontmatter is malformed', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    fs.writeFileSync(
      path.join(commandsDir, 'broken-frontmatter.md'),
      ['---', '', '# Heading', '', 'Fallback body description'].join('\n')
    );

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'broken-frontmatter',
        type: 'command',
        description: 'Fallback body description',
        path: path.join(commandsDir, 'broken-frontmatter.md'),
      },
    ]);
  });

  it('skips markdown files deeper than traversal depth limit', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    let currentDir = commandsDir;
    for (let index = 0; index < 11; index += 1) {
      currentDir = path.join(currentDir, `depth-${index}`);
      fs.mkdirSync(currentDir, { recursive: true });
    }
    fs.writeFileSync(path.join(currentDir, 'too-deep.md'), 'This should be ignored');

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/commands'
    );

    expect(payload.items).toEqual([]);
  });

  it('skips oversized markdown files when extracting descriptions', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const oversizedBody = `# Big\n\n${'x'.repeat(1024 * 1024)}`;
    fs.writeFileSync(path.join(commandsDir, 'oversized.md'), oversizedBody);
    fs.writeFileSync(path.join(commandsDir, 'safe.md'), 'Safe command description');

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'safe',
        type: 'command',
        description: 'Safe command description',
        path: path.join(commandsDir, 'safe.md'),
      },
    ]);
  });

  it('ignores markdown files in shared skills root', async () => {
    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(sharedSkillsDir, { recursive: true });
    fs.writeFileSync(path.join(sharedSkillsDir, 'CLAUDE.md'), 'not a skill directory');

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores invalid command markdown entries and keeps valid files', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });
    fs.writeFileSync(path.join(commandsDir, 'build.md'), 'Run build command');
    fs.mkdirSync(path.join(commandsDir, 'directory.md'), { recursive: true });

    const linkedDirTarget = path.join(tempHome, 'linked-command-dir.md');
    fs.mkdirSync(linkedDirTarget, { recursive: true });
    const linkedDirPath = path.join(commandsDir, 'linked-dir.md');
    createDirectorySymlink(linkedDirTarget, linkedDirPath);

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'build',
        type: 'command',
        description: 'Run build command',
        path: path.join(commandsDir, 'build.md'),
      },
    ]);
  });

  it('ignores skill symlink targets outside allowed roots', async () => {
    const skillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const outsideSkillDir = path.join(tempHome, 'external-skills', 'outside-skill');
    fs.mkdirSync(outsideSkillDir, { recursive: true });
    fs.writeFileSync(path.join(outsideSkillDir, 'SKILL.md'), 'Outside skill should be ignored');

    const linkPath = path.join(skillsDir, 'outside-skill');
    createDirectorySymlink(outsideSkillDir, linkPath);

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores agent symlink targets outside allowed roots', async () => {
    const agentsDir = path.join(ccsDir, 'shared', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const outsideAgentDir = path.join(tempHome, 'external-agents', 'outside-agent');
    fs.mkdirSync(outsideAgentDir, { recursive: true });
    fs.writeFileSync(path.join(outsideAgentDir, 'prompt.md'), 'Outside agent should be ignored');

    const linkPath = path.join(agentsDir, 'outside-agent');
    createDirectorySymlink(outsideAgentDir, linkPath);

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/agents'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores symlinked SKILL.md that escapes an allowed skill directory', async () => {
    const skillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const entryTargetDir = path.join(ccsDir, '.claude', 'skills', 'safe-skill');
    fs.mkdirSync(entryTargetDir, { recursive: true });

    const outsideMarkdown = path.join(tempHome, 'outside-skill.md');
    fs.writeFileSync(outsideMarkdown, 'Leaked content should never be read');
    createFileSymlink(outsideMarkdown, path.join(entryTargetDir, 'SKILL.md'));

    createDirectorySymlink(entryTargetDir, path.join(skillsDir, 'safe-skill'));

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(payload.items).toEqual([]);
  });

  it('ignores symlinked command markdown targets outside commands root', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const outsideMarkdown = path.join(tempHome, 'outside-command.md');
    fs.writeFileSync(outsideMarkdown, 'Outside command should not be read');
    createFileSymlink(outsideMarkdown, path.join(commandsDir, 'outside.md'));

    const payload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/commands'
    );
    expect(payload.items).toEqual([]);
  });

  it('rejects shared command content lookups that escape the commands root', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const outsideMarkdown = path.join(tempHome, 'outside-command.md');
    fs.writeFileSync(outsideMarkdown, 'Outside command should not be read');
    const escapedLinkPath = path.join(commandsDir, 'outside.md');
    createFileSymlink(outsideMarkdown, escapedLinkPath);

    const response = await fetch(
      `${baseUrl}/api/shared/content?type=commands&path=${encodeURIComponent(escapedLinkPath)}`
    );
    expect(response.status).toBe(404);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('Shared content not found');
  });

  it('returns 400 for invalid shared content query parameters', async () => {
    const missingType = await fetch(
      `${baseUrl}/api/shared/content?path=${encodeURIComponent('/tmp/a.md')}`
    );
    expect(missingType.status).toBe(400);

    const missingPath = await fetch(`${baseUrl}/api/shared/content?type=commands`);
    expect(missingPath.status).toBe(400);
  });

  it('ignores command file symlinks that escape into CCS_HOME/.claude/commands', async () => {
    const commandsDir = path.join(ccsDir, 'shared', 'commands');
    fs.mkdirSync(commandsDir, { recursive: true });

    const claudeCommandsDir = path.join(ccsDir, '.claude', 'commands');
    fs.mkdirSync(claudeCommandsDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeCommandsDir, 'borrowed.md'),
      'Borrowed command should be ignored'
    );

    fs.writeFileSync(path.join(commandsDir, 'local.md'), 'Local command stays visible');
    createFileSymlink(
      path.join(claudeCommandsDir, 'borrowed.md'),
      path.join(commandsDir, 'borrowed.md')
    );

    const payload = await getJson<{
      items: Array<{ name: string; type: string; description: string; path: string }>;
    }>(baseUrl, '/api/shared/commands');

    expect(payload.items).toEqual([
      {
        name: 'local',
        type: 'command',
        description: 'Local command stays visible',
        path: path.join(commandsDir, 'local.md'),
      },
    ]);
  });

  it('summary uses CLAUDE_CONFIG_DIR for symlink status and counts', async () => {
    const sharedDir = path.join(ccsDir, 'shared');
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    for (const linkType of ['commands', 'skills', 'agents']) {
      const targetDir = path.join(claudeConfigDir, linkType);
      fs.mkdirSync(targetDir, { recursive: true });

      const linkPath = path.join(sharedDir, linkType);
      createDirectorySymlink(targetDir, linkPath);
    }

    fs.writeFileSync(path.join(claudeConfigDir, 'commands', 'lint.md'), 'Run lint command');

    const skillDir = path.join(claudeConfigDir, 'skills', 'custom-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), 'Custom skill description');

    const agentDir = path.join(claudeConfigDir, 'agents', 'custom-agent');
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, 'prompt.md'), 'Custom agent prompt');

    const payload = await getJson<{
      commands: number;
      skills: number;
      agents: number;
      total: number;
      symlinkStatus: { valid: boolean; message: string };
    }>(baseUrl, '/api/shared/summary');

    expect(payload.commands).toBe(1);
    expect(payload.skills).toBe(1);
    expect(payload.agents).toBe(1);
    expect(payload.total).toBe(3);
    expect(payload.symlinkStatus).toEqual({
      valid: true,
      message: 'Symlinks active',
    });
  });

  it('summary uses CCS_HOME fallback Claude path when CLAUDE_CONFIG_DIR is unset', async () => {
    const sharedDir = path.join(ccsDir, 'shared');
    const claudeConfigDir = path.join(tempHome, '.claude');

    for (const linkType of ['commands', 'skills', 'agents']) {
      const targetDir = path.join(claudeConfigDir, linkType);
      fs.mkdirSync(targetDir, { recursive: true });
      createDirectorySymlink(targetDir, path.join(sharedDir, linkType));
    }

    fs.writeFileSync(path.join(claudeConfigDir, 'commands', 'test.md'), 'Command description');

    const payload = await getJson<{
      symlinkStatus: { valid: boolean; message: string };
      commands: number;
    }>(baseUrl, '/api/shared/summary');

    expect(payload.commands).toBe(1);
    expect(payload.symlinkStatus).toEqual({
      valid: true,
      message: 'Symlinks active',
    });
  });

  it('lists unlinked ~/.claude/skills as claude-default and serves content without ~/.ccs/shared/skills', async () => {
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    const claudeSkillDir = path.join(claudeConfigDir, 'skills', 'unlinked-skill');
    fs.mkdirSync(claudeSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeSkillDir, 'SKILL.md'),
      [
        '---',
        'name: unlinked-skill',
        'description: Default Claude skill before CCS symlink.',
        '---',
        '',
        '# Unlinked Skill',
        '',
        'Preview body from default Claude skills.',
      ].join('\n')
    );

    const skillsPayload = await getJson<{
      items: Array<{
        name: string;
        type: string;
        description: string;
        path: string;
        source?: string;
      }>;
    }>(baseUrl, '/api/shared/skills');

    expect(skillsPayload.items).toEqual([
      {
        name: 'unlinked-skill',
        type: 'skill',
        description: 'Default Claude skill before CCS symlink.',
        path: claudeSkillDir,
        source: 'claude-default',
      },
    ]);

    const summaryPayload = await getJson<{ skills: number; total: number }>(
      baseUrl,
      '/api/shared/summary'
    );
    expect(summaryPayload.skills).toBe(1);
    expect(summaryPayload.total).toBe(1);

    const contentPayload = await getJson<{ content: string; contentPath: string }>(
      baseUrl,
      `/api/shared/content?type=skills&path=${encodeURIComponent(claudeSkillDir)}`
    );
    expect(contentPayload.content).toContain('Preview body from default Claude skills.');
    expect(contentPayload.contentPath).toBe(fs.realpathSync(path.join(claudeSkillDir, 'SKILL.md')));
  });

  it('deduplicates skills by canonical realpath when ~/.ccs/shared/skills symlinks to ~/.claude/skills', async () => {
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    const claudeSkillsDir = path.join(claudeConfigDir, 'skills');
    const claudeSkillDir = path.join(claudeSkillsDir, 'linked-root-skill');
    fs.mkdirSync(claudeSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeSkillDir, 'SKILL.md'),
      '---\ndescription: Root-symlinked skill.\n---\n\n# Linked Root Skill'
    );

    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    createDirectorySymlink(claudeSkillsDir, sharedSkillsDir);

    const payload = await getJson<{
      items: Array<{
        name: string;
        type: string;
        description: string;
        path: string;
        source?: string;
      }>;
    }>(baseUrl, '/api/shared/skills');

    expect(payload.items).toEqual([
      {
        name: 'linked-root-skill',
        type: 'skill',
        description: 'Root-symlinked skill.',
        path: path.join(sharedSkillsDir, 'linked-root-skill'),
        source: 'ccs-shared',
      },
    ]);
  });

  it('deduplicates individual symlinked skill entries pointing to ~/.claude/skills', async () => {
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    const claudeSkillDir = path.join(claudeConfigDir, 'skills', 'single-linked-skill');
    fs.mkdirSync(claudeSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeSkillDir, 'SKILL.md'),
      '---\ndescription: Individually linked skill.\n---\n\n# Single Linked Skill'
    );

    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    fs.mkdirSync(sharedSkillsDir, { recursive: true });
    const sharedLinkPath = path.join(sharedSkillsDir, 'single-linked-skill');
    createDirectorySymlink(claudeSkillDir, sharedLinkPath);

    const payload = await getJson<{
      items: Array<{
        name: string;
        type: string;
        description: string;
        path: string;
        source?: string;
      }>;
    }>(baseUrl, '/api/shared/skills');

    expect(payload.items).toEqual([
      {
        name: 'single-linked-skill',
        type: 'skill',
        description: 'Individually linked skill.',
        path: sharedLinkPath,
        source: 'ccs-shared',
      },
    ]);
  });

  it('returns both ccs-shared and claude-default skills when directories are mixed', async () => {
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    const sharedSkillsDir = path.join(ccsDir, 'shared', 'skills');
    const sharedOnlyDir = path.join(sharedSkillsDir, 'alpha-shared');
    fs.mkdirSync(sharedOnlyDir, { recursive: true });
    fs.writeFileSync(path.join(sharedOnlyDir, 'SKILL.md'), 'Shared-only skill description');

    const claudeSkillsDir = path.join(claudeConfigDir, 'skills');
    const claudeOnlyDir = path.join(claudeSkillsDir, 'beta-claude');
    fs.mkdirSync(claudeOnlyDir, { recursive: true });
    fs.writeFileSync(path.join(claudeOnlyDir, 'SKILL.md'), 'Claude-only skill description');

    const payload = await getJson<{
      items: Array<{
        name: string;
        type: string;
        description: string;
        path: string;
        source?: string;
      }>;
    }>(baseUrl, '/api/shared/skills');

    expect(payload.items).toEqual([
      {
        name: 'alpha-shared',
        type: 'skill',
        description: 'Shared-only skill description',
        path: sharedOnlyDir,
        source: 'ccs-shared',
      },
      {
        name: 'beta-claude',
        type: 'skill',
        description: 'Claude-only skill description',
        path: claudeOnlyDir,
        source: 'claude-default',
      },
    ]);
  });

  it('ignores symlinks inside ~/.claude/skills pointing outside allowed roots and returns 404 for content', async () => {
    const claudeConfigDir = path.join(tempHome, 'custom-claude');
    process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;

    const claudeSkillsDir = path.join(claudeConfigDir, 'skills');
    fs.mkdirSync(claudeSkillsDir, { recursive: true });

    const outsideSkillDir = path.join(tempHome, '.agents', 'skills', 'external-skill');
    fs.mkdirSync(outsideSkillDir, { recursive: true });
    fs.writeFileSync(path.join(outsideSkillDir, 'SKILL.md'), 'External agent skill');

    const escapedLinkPath = path.join(claudeSkillsDir, 'external-skill');
    createDirectorySymlink(outsideSkillDir, escapedLinkPath);

    const listPayload = await getJson<{ items: Array<{ name: string }> }>(
      baseUrl,
      '/api/shared/skills'
    );
    expect(listPayload.items).toEqual([]);

    const contentResponse = await fetch(
      `${baseUrl}/api/shared/content?type=skills&path=${encodeURIComponent(escapedLinkPath)}`
    );
    expect(contentResponse.status).toBe(404);
    const contentPayload = (await contentResponse.json()) as { error: string };
    expect(contentPayload.error).toBe('Shared content not found');
  });
});
