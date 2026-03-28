/**
 * Profile Routes - CRUD operations for user profiles
 *
 * Uses unified config (config.yaml) when available, falls back to legacy (config.json).
 * Note: Account routes have been moved to account-routes.ts
 */

import { Router, Request, Response } from 'express';
import { isReservedName, RESERVED_PROFILE_NAMES } from '../../config/reserved-names';
import {
  createApiProfile,
  createCliproxyBridgeProfile,
  removeApiProfile,
  updateApiProfileTarget,
  discoverApiProfileOrphans,
  registerApiProfileOrphans,
  copyApiProfile,
  exportApiProfile,
  importApiProfileBundle,
  apiProfileExists,
  listCliproxyBridgeProviders,
  listApiProfiles,
  validateApiName,
} from '../../api/services';
import { normalizeDroidProvider } from '../../targets/droid-provider';
import { getPersistedTargetChoices } from '../../targets/target-metadata';
import { isCLIProxyProvider } from '../../cliproxy/provider-capabilities';
import { isAnthropicDirectProfile, updateSettingsFile, parseTarget } from './route-helpers';

const router = Router();

function isDenylistError(message: string | undefined): boolean {
  return typeof message === 'string' && message.toLowerCase().includes('denylist');
}

function getUnknownKeys(
  payload: Record<string, unknown>,
  allowedKeys: readonly string[]
): string[] {
  const allowed = new Set(allowedKeys);
  return Object.keys(payload).filter((key) => !allowed.has(key));
}

function validatePayloadShape(
  body: unknown,
  allowedKeys: readonly string[]
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const payload = body as Record<string, unknown>;
  const unknownKeys = getUnknownKeys(payload, allowedKeys);
  if (unknownKeys.length > 0) {
    return { ok: false, error: `Unknown profile field(s): ${unknownKeys.join(', ')}` };
  }
  return { ok: true, payload };
}

// ==================== Profile CRUD ====================

/**
 * GET /api/profiles - List all profiles
 */
router.get('/', (_req: Request, res: Response): void => {
  try {
    const result = listApiProfiles();
    // Map isConfigured -> configured for UI compatibility
    const profiles = result.profiles.map((p) => ({
      name: p.name,
      settingsPath: p.settingsPath,
      configured: p.isConfigured,
      target: p.target,
      cliproxyBridge: p.cliproxyBridge ?? null,
    }));
    res.json({ profiles });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/cliproxy-bridge/providers', (_req: Request, res: Response): void => {
  try {
    res.json({ providers: listCliproxyBridgeProviders() });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/cliproxy-bridge', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body, ['provider', 'name', 'target']);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const provider = typeof shape.payload.provider === 'string' ? shape.payload.provider.trim() : '';
  if (!isCLIProxyProvider(provider)) {
    res.status(400).json({ error: 'Invalid provider. Expected a supported CLIProxy provider ID.' });
    return;
  }

  const target = parseTarget(shape.payload.target);
  if (shape.payload.target !== undefined && target === null) {
    res.status(400).json({ error: `Invalid target. Expected: ${getPersistedTargetChoices()}` });
    return;
  }

  const result = createCliproxyBridgeProfile(provider, {
    name: typeof shape.payload.name === 'string' ? shape.payload.name : undefined,
    target: target || 'claude',
  });

  if (!result.success || !result.name) {
    const errorMessage = result.error || 'Failed to create CLIProxy bridge profile';
    res.status(errorMessage.toLowerCase().includes('already exists') ? 409 : 400).json({
      error: errorMessage,
    });
    return;
  }

  res.status(201).json({
    name: result.name,
    settingsPath: result.settingsFile,
    target: result.target || 'claude',
    cliproxyBridge: result.cliproxyBridge ?? null,
  });
});

/**
 * POST /api/profiles - Create new profile
 */
router.post('/', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body, [
    'name',
    'baseUrl',
    'apiKey',
    'model',
    'opusModel',
    'sonnetModel',
    'haikuModel',
    'target',
    'droidProvider',
    'provider',
  ]);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const { name, baseUrl, apiKey, model, opusModel, sonnetModel, haikuModel, target } = req.body;
  const providerHint = req.body?.droidProvider ?? req.body?.provider;
  const parsedProvider = normalizeDroidProvider(providerHint);
  const normalizedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : '';
  const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  const allowsEmptyBaseUrl = isAnthropicDirectProfile(normalizedBaseUrl, normalizedApiKey);

  const parsedTarget = parseTarget(target);
  if (target !== undefined && parsedTarget === null) {
    res.status(400).json({ error: `Invalid target. Expected: ${getPersistedTargetChoices()}` });
    return;
  }
  if (providerHint !== undefined && parsedProvider === null) {
    res.status(400).json({
      error: 'Invalid droid provider. Expected: anthropic, openai, or generic-chat-completion-api',
    });
    return;
  }

  if (!name || !normalizedApiKey || (!normalizedBaseUrl && !allowsEmptyBaseUrl)) {
    res.status(400).json({
      error: 'Missing required fields: name, apiKey, and baseUrl for proxy profiles',
    });
    return;
  }

  // Validate reserved names
  if (isReservedName(name)) {
    res.status(400).json({
      error: `Profile name '${name}' is reserved`,
      reserved: RESERVED_PROFILE_NAMES,
    });
    return;
  }

  // Check if profile already exists (uses unified config when available)
  if (apiProfileExists(name)) {
    res.status(409).json({ error: 'Profile already exists' });
    return;
  }

  // Create profile using unified-config-aware service
  const result = createApiProfile(
    name,
    normalizedBaseUrl,
    normalizedApiKey,
    {
      default: model || '',
      opus: opusModel || model || '',
      sonnet: sonnetModel || model || '',
      haiku: haikuModel || model || '',
    },
    parsedTarget || 'claude',
    parsedProvider || undefined
  );

  if (!result.success) {
    const errorMessage = result.error || 'Failed to create profile';
    res.status(isDenylistError(errorMessage) ? 400 : 500).json({ error: errorMessage });
    return;
  }

  res.status(201).json({
    name,
    settingsPath: result.settingsFile,
    target: parsedTarget || 'claude',
    cliproxyBridge: null,
  });
});

/**
 * GET /api/profiles/orphans - Discover orphan ~/.ccs/*.settings.json files
 */
router.get('/orphans', (_req: Request, res: Response): void => {
  try {
    const result = discoverApiProfileOrphans();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/profiles/orphans/register - Register discovered orphan settings
 */
router.post('/orphans/register', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body ?? {}, ['names', 'target', 'force']);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const payload = shape.payload;
  let names: string[] | undefined;
  if (payload.names !== undefined) {
    if (!Array.isArray(payload.names)) {
      res.status(400).json({ error: 'names must be an array of profile names' });
      return;
    }

    const invalidNameEntry = payload.names.find(
      (value) => typeof value !== 'string' || value.trim().length === 0
    );
    if (invalidNameEntry !== undefined) {
      res.status(400).json({ error: 'names must contain non-empty strings only' });
      return;
    }

    names = payload.names.map((value) => value.trim());
    const invalidName = names.find((name) => validateApiName(name) !== null);
    if (invalidName) {
      res.status(400).json({ error: `Invalid profile name in names: ${invalidName}` });
      return;
    }
  }
  const target = parseTarget(payload.target);
  const force = payload.force === true;

  if (payload.target !== undefined && target === null) {
    res.status(400).json({ error: `Invalid target. Expected: ${getPersistedTargetChoices()}` });
    return;
  }

  try {
    const result = registerApiProfileOrphans({
      names,
      target: target || 'claude',
      force,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/profiles/:name/copy - Duplicate an API profile
 */
router.post('/:name/copy', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body, ['destination', 'target', 'force']);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const { name } = req.params;
  const sourceNameError = validateApiName(name);
  if (sourceNameError) {
    res.status(400).json({ error: sourceNameError });
    return;
  }
  const destination = shape.payload.destination;
  const target = parseTarget(shape.payload.target);
  const force = shape.payload.force === true;

  if (typeof destination !== 'string' || destination.trim().length === 0) {
    res.status(400).json({ error: 'destination is required' });
    return;
  }
  if (shape.payload.target !== undefined && target === null) {
    res.status(400).json({ error: `Invalid target. Expected: ${getPersistedTargetChoices()}` });
    return;
  }

  const result = copyApiProfile(name, destination.trim(), { target: target || undefined, force });
  if (!result.success) {
    res.status(400).json({ error: result.error || 'Failed to copy profile' });
    return;
  }

  res.status(201).json(result);
});

/**
 * POST /api/profiles/:name/export - Export profile as a portable bundle
 */
router.post('/:name/export', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body ?? {}, ['includeSecrets']);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const { name } = req.params;
  const profileNameError = validateApiName(name);
  if (profileNameError) {
    res.status(400).json({ error: profileNameError });
    return;
  }
  const includeSecrets = shape.payload.includeSecrets === true;
  const result = exportApiProfile(name, includeSecrets);
  if (!result.success || !result.bundle) {
    res.status(400).json({ error: result.error || 'Failed to export profile' });
    return;
  }

  res.json(result);
});

/**
 * POST /api/profiles/import - Import profile bundle into local registry
 */
router.post('/import', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body, ['bundle', 'name', 'target', 'force']);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const target = parseTarget(shape.payload.target);
  if (shape.payload.target !== undefined && target === null) {
    res.status(400).json({ error: `Invalid target. Expected: ${getPersistedTargetChoices()}` });
    return;
  }

  const bundle = shape.payload.bundle;
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    res.status(400).json({ error: 'bundle must be a JSON object' });
    return;
  }
  const bundleTarget = (bundle as { profile?: { target?: unknown } }).profile?.target;
  if (bundleTarget !== undefined && parseTarget(bundleTarget) === null) {
    res.status(400).json({
      error: `Invalid bundle profile target. Expected: ${getPersistedTargetChoices()}`,
    });
    return;
  }

  const result = importApiProfileBundle(bundle, {
    name: typeof shape.payload.name === 'string' ? shape.payload.name : undefined,
    target: target || undefined,
    force: shape.payload.force === true,
  });

  if (!result.success) {
    res.status(400).json({
      error: result.error || 'Failed to import profile',
      validation: result.validation,
    });
    return;
  }

  res.status(201).json(result);
});

/**
 * PUT /api/profiles/:name - Update profile
 */
router.put('/:name', (req: Request, res: Response): void => {
  const shape = validatePayloadShape(req.body, [
    'baseUrl',
    'apiKey',
    'model',
    'opusModel',
    'sonnetModel',
    'haikuModel',
    'target',
    'droidProvider',
    'provider',
  ]);
  if (!shape.ok) {
    res.status(400).json({ error: shape.error });
    return;
  }

  const { name } = req.params;
  const { baseUrl, apiKey, model, opusModel, sonnetModel, haikuModel, target } = req.body;
  const providerHint = req.body?.droidProvider ?? req.body?.provider;
  const parsedProvider = normalizeDroidProvider(providerHint);
  const normalizedBaseUrl = typeof baseUrl === 'string' ? baseUrl.trim() : baseUrl;
  const normalizedApiKey = typeof apiKey === 'string' ? apiKey.trim() : apiKey;

  const parsedTarget = parseTarget(target);
  if (target !== undefined && parsedTarget === null) {
    res.status(400).json({ error: `Invalid target. Expected: ${getPersistedTargetChoices()}` });
    return;
  }
  if (providerHint !== undefined && parsedProvider === null) {
    res.status(400).json({
      error: 'Invalid droid provider. Expected: anthropic, openai, or generic-chat-completion-api',
    });
    return;
  }

  // Check if profile exists (uses unified config when available)
  if (!apiProfileExists(name)) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  // Validate required fields if provided (prevent setting to empty)
  if (normalizedApiKey !== undefined && !normalizedApiKey) {
    res.status(400).json({ error: 'apiKey cannot be empty' });
    return;
  }

  try {
    const hasSettingsUpdates =
      baseUrl !== undefined ||
      apiKey !== undefined ||
      model !== undefined ||
      opusModel !== undefined ||
      sonnetModel !== undefined ||
      haikuModel !== undefined ||
      providerHint !== undefined;
    const hasTargetUpdate = target !== undefined;

    if (!hasSettingsUpdates && !hasTargetUpdate) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }

    if (hasSettingsUpdates) {
      updateSettingsFile(name, {
        baseUrl: normalizedBaseUrl,
        apiKey: normalizedApiKey,
        model,
        opusModel,
        sonnetModel,
        haikuModel,
        provider: parsedProvider || undefined,
      });
    }

    if (hasTargetUpdate && parsedTarget) {
      const targetUpdate = updateApiProfileTarget(name, parsedTarget);
      if (!targetUpdate.success) {
        res.status(500).json({ error: targetUpdate.error || 'Failed to update target' });
        return;
      }
    }

    res.json({
      name,
      updated: true,
      ...(hasTargetUpdate && parsedTarget && { target: parsedTarget }),
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    res.status(isDenylistError(errorMessage) ? 400 : 500).json({ error: errorMessage });
  }
});

/**
 * DELETE /api/profiles/:name - Delete profile
 */
router.delete('/:name', (req: Request, res: Response): void => {
  const { name } = req.params;

  // Check if profile exists (uses unified config when available)
  if (!apiProfileExists(name)) {
    res.status(404).json({ error: 'Profile not found' });
    return;
  }

  // Remove profile using unified-config-aware service
  const result = removeApiProfile(name);

  if (!result.success) {
    res.status(500).json({ error: result.error || 'Failed to delete profile' });
    return;
  }

  res.json({ name, deleted: true });
});

export default router;
export { parseTarget } from './route-helpers';
