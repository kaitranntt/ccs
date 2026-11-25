import { describe, expect, it } from 'bun:test';
import {
  API_BASE_URL,
  API_CONFLICT_ERROR_CODE,
  ApiConflictError,
  isApiConflictError,
  withApiBase,
} from '../../ui/src/lib/api/core';

describe('ui api-client helpers', () => {
  it('normalizes relative paths with API base prefix', () => {
    expect(withApiBase('/cliproxy/status')).toBe('/api/cliproxy/status');
    expect(withApiBase('cliproxy/status')).toBe('/api/cliproxy/status');
  });

  it('preserves paths that already include API base', () => {
    expect(withApiBase('/api/cliproxy/status')).toBe('/api/cliproxy/status');
    expect(withApiBase('/api')).toBe('/api');
  });

  it('handles empty and absolute URLs safely', () => {
    expect(withApiBase('')).toBe(API_BASE_URL);
    expect(withApiBase('https://example.com/api')).toBe('https://example.com/api');
  });

  it('identifies typed API conflict errors', () => {
    const conflict = new ApiConflictError('conflict');
    expect(conflict.code).toBe(API_CONFLICT_ERROR_CODE);
    expect(isApiConflictError(conflict)).toBe(true);
    expect(isApiConflictError(new Error('plain'))).toBe(false);
  });
});
