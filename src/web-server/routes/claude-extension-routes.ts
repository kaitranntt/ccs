import { Router, Request, Response } from 'express';
import {
  CLAUDE_EXTENSION_HOSTS,
  type ClaudeExtensionHost,
  getClaudeExtensionHostDefinition,
} from '../../shared/claude-extension-hosts';
import {
  getClaudeSharedSettingsPath,
  listClaudeExtensionProfiles,
  renderClaudeExtensionSettingsJson,
  renderSharedClaudeSettingsJson,
  resolveClaudeExtensionSetup,
} from '../../shared/claude-extension-setup';
import {
  createClaudeExtensionBinding,
  deleteClaudeExtensionBinding,
  getClaudeExtensionBinding,
  listClaudeExtensionBindings,
  updateClaudeExtensionBinding,
} from '../services/claude-extension-binding-service';
import {
  applyClaudeExtensionBinding,
  getDefaultClaudeExtensionIdeSettingsPath,
  resetClaudeExtensionBinding,
  resolveClaudeExtensionIdeSettingsPath,
  type ClaudeExtensionActionTarget,
  verifyClaudeExtensionBinding,
} from '../services/claude-extension-settings-service';
import { requireLocalAccessWhenAuthDisabled } from '../middleware/auth-middleware';

const router = Router();
const VALID_HOSTS = new Set(CLAUDE_EXTENSION_HOSTS.map((host) => host.id));
const SETUP_LOCAL_ACCESS_ERROR =
  'Claude extension setup requires localhost access when dashboard auth is disabled.';
const VALID_TARGETS = new Set<ClaudeExtensionActionTarget>(['shared', 'ide', 'all']);

function getHostFromRequest(req: Request): ClaudeExtensionHost {
  const rawHost = String(req.query.host || 'vscode');
  if (!VALID_HOSTS.has(rawHost as ClaudeExtensionHost)) {
    throw new Error(
      `Invalid host "${rawHost}". Use: ${CLAUDE_EXTENSION_HOSTS.map((host) => host.id).join(', ')}`
    );
  }
  return rawHost as ClaudeExtensionHost;
}

function getActionTarget(req: Request): ClaudeExtensionActionTarget {
  const rawTarget =
    req.body && typeof req.body.target === 'string' ? req.body.target.trim().toLowerCase() : 'all';
  if (!VALID_TARGETS.has(rawTarget as ClaudeExtensionActionTarget)) {
    throw new Error('Invalid target. Use: shared, ide, or all');
  }
  return rawTarget as ClaudeExtensionActionTarget;
}

function serializeBinding(id: string) {
  const binding = getClaudeExtensionBinding(id);
  return {
    ...binding,
    effectiveIdeSettingsPath: resolveClaudeExtensionIdeSettingsPath(binding),
    usesDefaultIdeSettingsPath: !binding.ideSettingsPath,
  };
}

function handleRouteError(res: Response, error: unknown): void {
  const message = (error as Error).message;
  if (message.startsWith('Binding not found')) {
    res.status(404).json({ error: message });
    return;
  }
  res.status(400).json({ error: message });
}

router.get('/profiles', (_req: Request, res: Response): void => {
  res.json({
    profiles: listClaudeExtensionProfiles(),
    hosts: CLAUDE_EXTENSION_HOSTS.map((host) => ({
      ...host,
      defaultSettingsPath: getDefaultClaudeExtensionIdeSettingsPath(host.id),
    })),
  });
});

router.get('/setup', async (req: Request, res: Response): Promise<void> => {
  if (!requireLocalAccessWhenAuthDisabled(req, res, SETUP_LOCAL_ACCESS_ERROR)) {
    return;
  }

  const rawProfile = typeof req.query.profile === 'string' ? req.query.profile.trim() : '';
  if (!rawProfile) {
    res.status(400).json({ error: 'Missing required query parameter: profile' });
    return;
  }

  try {
    const host = getHostFromRequest(req);
    const setup = await resolveClaudeExtensionSetup(rawProfile);
    const hostDefinition = getClaudeExtensionHostDefinition(host);

    res.json({
      profile: {
        requestedProfile: setup.requestedProfile,
        resolvedProfileName: setup.resolvedProfileName,
        profileType: setup.profileType,
        label: setup.profileLabel,
        description: setup.profileDescription,
      },
      host: hostDefinition,
      env: Object.entries(setup.extensionEnv).map(([name, value]) => ({ name, value })),
      warnings: setup.warnings,
      notes: setup.notes,
      removeEnvKeys: setup.removeEnvKeys,
      sharedSettings: {
        path: getClaudeSharedSettingsPath(),
        command: `ccs persist ${rawProfile}`,
        json: renderSharedClaudeSettingsJson(setup),
      },
      ideSettings: {
        path: getDefaultClaudeExtensionIdeSettingsPath(host),
        targetLabel: hostDefinition.settingsTargetLabel,
        json: renderClaudeExtensionSettingsJson(setup, host),
      },
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/bindings', (_req: Request, res: Response): void => {
  try {
    res.json({
      bindings: listClaudeExtensionBindings().map((binding) => ({
        ...binding,
        effectiveIdeSettingsPath: resolveClaudeExtensionIdeSettingsPath(binding),
        usesDefaultIdeSettingsPath: !binding.ideSettingsPath,
      })),
    });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/bindings', (req: Request, res: Response): void => {
  try {
    const binding = createClaudeExtensionBinding(req.body);
    res.status(201).json({ binding: serializeBinding(binding.id) });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.put('/bindings/:id', (req: Request, res: Response): void => {
  try {
    const binding = updateClaudeExtensionBinding(req.params.id, req.body);
    res.json({ binding: serializeBinding(binding.id) });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.delete('/bindings/:id', (req: Request, res: Response): void => {
  try {
    deleteClaudeExtensionBinding(req.params.id);
    res.status(204).end();
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.get('/bindings/:id/verify', async (req: Request, res: Response): Promise<void> => {
  try {
    const binding = getClaudeExtensionBinding(req.params.id);
    const status = await verifyClaudeExtensionBinding(binding);
    res.json({ binding: serializeBinding(binding.id), ...status });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/bindings/:id/apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const binding = getClaudeExtensionBinding(req.params.id);
    const status = await applyClaudeExtensionBinding(binding, getActionTarget(req));
    res.json({ binding: serializeBinding(binding.id), ...status });
  } catch (error) {
    handleRouteError(res, error);
  }
});

router.post('/bindings/:id/reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const binding = getClaudeExtensionBinding(req.params.id);
    const status = await resetClaudeExtensionBinding(binding, getActionTarget(req));
    res.json({ binding: serializeBinding(binding.id), ...status });
  } catch (error) {
    handleRouteError(res, error);
  }
});

export default router;
