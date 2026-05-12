import * as fs from 'fs';
import { resolveOpenAICompatProfileConfig } from './profile-router';
import { OPENAI_COMPAT_PROXY_DEFAULT_PORT } from './proxy-daemon-paths';
import { startOpenAICompatProxyServer } from './server/proxy-server';
import { loadSettings } from '../config/config-loader-facade';

interface RuntimeOptions {
  port: number;
  host: string;
  profileName: string;
  settingsPath: string;
  authToken: string;
  authTokenFile: string;
  insecure: boolean;
}

function parseArgs(argv: string[]): RuntimeOptions {
  let port = OPENAI_COMPAT_PROXY_DEFAULT_PORT;
  let host = '127.0.0.1';
  let profileName = '';
  let settingsPath = '';
  let authToken = '';
  let authTokenFile = '';
  let insecure = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      port = Number.parseInt(argv[++i] || '', 10) || port;
      continue;
    }
    if (arg === '--host' && argv[i + 1]) {
      host = argv[++i] || host;
      continue;
    }
    if (arg === '--profile' && argv[i + 1]) {
      profileName = argv[++i] || '';
      continue;
    }
    if (arg === '--settings-path' && argv[i + 1]) {
      settingsPath = argv[++i] || '';
      continue;
    }
    if (arg === '--auth-token' && argv[i + 1]) {
      authToken = argv[++i] || '';
      continue;
    }
    if (arg === '--auth-token-file' && argv[i + 1]) {
      authTokenFile = argv[++i] || '';
      continue;
    }
    if (arg === '--insecure') {
      insecure = true;
    }
  }

  return { port, host, profileName, settingsPath, authToken, authTokenFile, insecure };
}

function readAuthToken(options: RuntimeOptions): string {
  if (options.authTokenFile) {
    try {
      const token = fs.readFileSync(options.authTokenFile, 'utf8').trim();
      fs.unlinkSync(options.authTokenFile);
      return token;
    } catch (error) {
      throw new Error(`Failed to read local proxy auth token file: ${(error as Error).message}`);
    }
  }

  return options.authToken;
}

function startRuntime(options: RuntimeOptions): void {
  const authToken = readAuthToken(options);

  if (!authToken.trim()) {
    throw new Error('Missing local proxy auth token');
  }

  const settings = loadSettings(options.settingsPath);
  const profile = resolveOpenAICompatProfileConfig(
    options.profileName,
    options.settingsPath,
    settings.env || {}
  );
  if (!profile) {
    throw new Error(
      `Profile "${options.profileName}" is not an OpenAI-compatible settings profile`
    );
  }

  const server = startOpenAICompatProxyServer({
    profile,
    host: options.host,
    port: options.port,
    authToken,
    insecure: options.insecure,
  });
  server.once('error', (error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
  const shutdown = () => server.close();
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

if (require.main === module) {
  startRuntime(parseArgs(process.argv.slice(2)));
}
