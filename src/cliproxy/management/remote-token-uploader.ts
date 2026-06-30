/**
 * Remote Token Uploader
 *
 * Uploads OAuth tokens to remote CLIProxyAPI server after local authentication.
 * Enables multi-device access to the same OAuth accounts.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getProxyTarget, buildProxyUrl } from '../proxy/proxy-target-resolver';
import { info, ok, fail, warn } from '../../utils/ui';

/** Timeout for upload requests (ms) */
const UPLOAD_TIMEOUT_MS = 10000;

/** Response from POST /v0/management/auth-files */
interface UploadResponse {
  status?: string;
  success?: boolean;
  id?: string;
  message?: string;
  error?: string;
}

/**
 * Upload a token file to remote CLIProxyAPI server.
 * Uses multipart/form-data as required by CLIProxyAPI.
 *
 * @param tokenFilePath - Path to local token JSON file
 * @param verbose - Enable verbose logging
 * @returns true if upload succeeded
 */
export async function uploadTokenToRemote(
  tokenFilePath: string,
  verbose = false
): Promise<boolean> {
  const target = getProxyTarget();

  if (!target.isRemote) {
    if (verbose) {
      process.stderr.write('[upload] Remote mode not enabled, skipping upload\n');
    }
    return false;
  }

  // Read token file
  let tokenContent: string;
  try {
    tokenContent = fs.readFileSync(tokenFilePath, 'utf-8');
  } catch (error) {
    process.stderr.write(
      String(fail(`Failed to read token file: ${(error as Error).message}`)) + '\n'
    );
    return false;
  }

  // Validate JSON
  try {
    JSON.parse(tokenContent);
  } catch {
    process.stderr.write(String(fail('Invalid token file: not valid JSON')) + '\n');
    return false;
  }

  const fileName = path.basename(tokenFilePath);
  const url = buildProxyUrl(target, '/v0/management/auth-files');

  // Use Authorization: Bearer header for authentication
  const authKey = target.managementKey ?? target.authToken;

  if (verbose) {
    process.stderr.write(`[upload] Uploading ${fileName} to ${target.host}\n`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  try {
    // CLIProxyAPI requires multipart/form-data with "file" field
    const formData = new FormData();
    const blob = new Blob([tokenContent], { type: 'application/json' });
    formData.append('file', blob, fileName);

    const headers: Record<string, string> = {};
    if (authKey) {
      headers['Authorization'] = `Bearer ${authKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      process.stderr.write(String(fail(`Upload failed: ${response.status} ${text}`)) + '\n');
      return false;
    }

    const result = (await response.json()) as UploadResponse;

    if (result.status === 'ok' || result.success || result.id) {
      console.log(ok(`Token uploaded to remote server: ${fileName}`));
      return true;
    } else {
      process.stderr.write(
        String(fail(`Upload failed: ${result.error || result.message || 'Unknown error'}`)) + '\n'
      );
      return false;
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      process.stderr.write(String(fail('Upload timed out')) + '\n');
    } else {
      process.stderr.write(String(fail(`Upload failed: ${(error as Error).message}`)) + '\n');
    }
    return false;
  }
}

/**
 * Upload all tokens from a provider directory to remote server.
 *
 * @param tokenDir - Directory containing token files
 * @param verbose - Enable verbose logging
 * @returns Number of successfully uploaded tokens
 */
export async function uploadAllTokensToRemote(tokenDir: string, verbose = false): Promise<number> {
  const target = getProxyTarget();

  if (!target.isRemote) {
    if (verbose) {
      process.stderr.write('[upload] Remote mode not enabled, skipping upload\n');
    }
    return 0;
  }

  if (!fs.existsSync(tokenDir)) {
    if (verbose) {
      process.stderr.write(`[upload] Token directory does not exist: ${tokenDir}\n`);
    }
    return 0;
  }

  const files = fs.readdirSync(tokenDir).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    if (verbose) {
      process.stderr.write('[upload] No token files found\n');
    }
    return 0;
  }

  console.log(info(`Uploading ${files.length} token(s) to remote server...`));

  let uploaded = 0;
  for (const file of files) {
    const filePath = path.join(tokenDir, file);
    const success = await uploadTokenToRemote(filePath, verbose);
    if (success) {
      uploaded++;
    }
  }

  if (uploaded > 0) {
    console.log(ok(`Uploaded ${uploaded}/${files.length} token(s) to ${target.host}`));
  } else {
    console.log(warn('No tokens were uploaded'));
  }

  return uploaded;
}

/**
 * Check if remote upload is enabled and configured.
 */
export function isRemoteUploadEnabled(): boolean {
  const target = getProxyTarget();
  return target.isRemote && Boolean(target.managementKey ?? target.authToken);
}
