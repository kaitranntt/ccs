import { describe, expect, it } from 'bun:test';

async function loadAntigravityQuotaTestExports() {
  const moduleId = Date.now() + Math.random();
  const mod = await import(`../quota-fetcher?agy-quota-fetcher=${moduleId}`);
  return mod.__testExports;
}

describe('Antigravity quota failure metadata', () => {
  it('marks 403 failures as not entitled', async () => {
    const { buildAntigravityFailure } = await loadAntigravityQuotaTestExports();

    const result = buildAntigravityFailure(403, 'forbidden');

    expect(result.entitlement).toMatchObject({
      accessState: 'not_entitled',
      capacityState: 'unknown',
    });
  });

  it('marks 429 failures as rate limited', async () => {
    const { buildAntigravityFailure } = await loadAntigravityQuotaTestExports();

    const result = buildAntigravityFailure(429, 'rate limited');

    expect(result.entitlement).toMatchObject({
      accessState: 'unknown',
      capacityState: 'rate_limited',
    });
  });

  it('preserves entitlement evidence when project lookup fails before quota fetch', async () => {
    const moduleId = Date.now() + Math.random();
    const { fetchAccountQuota } = await import(`../quota-fetcher?agy-early=${moduleId}`);
    const { getProviderAuthDir } = await import(
      `../../config/config-generator?agy-config=${moduleId}`
    );
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');

    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-agy-failure-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    try {
      const authDir = getProviderAuthDir('agy');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'antigravity-user@example.com.json'),
        JSON.stringify({
          type: 'antigravity',
          email: 'user@example.com',
          project_id: 'project-x',
          access_token: 'token',
        })
      );

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: { message: 'forbidden' } }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch;

      try {
        const result = await fetchAccountQuota('agy', 'user@example.com');
        expect(result.success).toBe(false);
        expect(result.entitlement).toMatchObject({
          accessState: 'not_entitled',
          capacityState: 'unknown',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('attaches entitlement evidence when project lookup returns an invalid 2xx payload', async () => {
    const moduleId = Date.now() + Math.random();
    const { fetchAccountQuota } = await import(`../quota-fetcher?agy-invalid-project=${moduleId}`);
    const { getProviderAuthDir } = await import(
      `../../config/config-generator?agy-config=${moduleId}`
    );
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');

    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-agy-invalid-project-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    try {
      const authDir = getProviderAuthDir('agy');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'antigravity-user@example.com.json'),
        JSON.stringify({
          type: 'antigravity',
          email: 'user@example.com',
          access_token: 'token',
        })
      );

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response('', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })) as typeof fetch;

      try {
        const result = await fetchAccountQuota('agy', 'user@example.com');
        expect(result.success).toBe(false);
        expect(result.errorCode).toBe('provider_unavailable');
        expect(result.entitlement).toMatchObject({
          accessState: 'unknown',
          capacityState: 'temporarily_unavailable',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('preserves live tier evidence when quota fetch fails after a successful project lookup', async () => {
    const moduleId = Date.now() + Math.random();
    const { fetchAccountQuota } = await import(`../quota-fetcher?agy-invalid-models=${moduleId}`);
    const { getProviderAuthDir } = await import(
      `../../config/config-generator?agy-config=${moduleId}`
    );
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');

    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-agy-invalid-models-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    try {
      const authDir = getProviderAuthDir('agy');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'antigravity-user@example.com.json'),
        JSON.stringify({
          type: 'antigravity',
          email: 'user@example.com',
          access_token: 'token',
        })
      );

      const originalFetch = globalThis.fetch;
      let requestCount = 0;
      globalThis.fetch = (async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(
            JSON.stringify({
              cloudaicompanionProject: { id: 'project-x' },
              paidTier: { id: 'g1-pro-tier' },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response('', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof fetch;

      try {
        const result = await fetchAccountQuota('agy', 'user@example.com');
        expect(result.success).toBe(false);
        expect(result.entitlement).toMatchObject({
          normalizedTier: 'pro',
          rawTierId: 'g1-pro-tier',
          rawTierLabel: 'Pro',
          accessState: 'unknown',
          capacityState: 'temporarily_unavailable',
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  it('tries the daily loadCodeAssist host before falling back to prod', async () => {
    const moduleId = Date.now() + Math.random();
    const { fetchAccountQuota } = await import(`../quota-fetcher?agy-daily-host=${moduleId}`);
    const { getProviderAuthDir } = await import(
      `../../config/config-generator?agy-config=${moduleId}`
    );
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');

    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ccs-agy-daily-host-'));
    const originalCcsHome = process.env.CCS_HOME;
    process.env.CCS_HOME = tempHome;

    try {
      const authDir = getProviderAuthDir('agy');
      fs.mkdirSync(authDir, { recursive: true });
      fs.writeFileSync(
        path.join(authDir, 'antigravity-user@example.com.json'),
        JSON.stringify({
          type: 'antigravity',
          email: 'user@example.com',
          access_token: 'token',
        })
      );

      const originalFetch = globalThis.fetch;
      const urls: string[] = [];
      globalThis.fetch = (async (input, init) => {
        const url = String(input);
        urls.push(url);

        if (url === 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist') {
          const bodyText = typeof init?.body === 'string' ? init.body : '';
          expect(init?.headers).toMatchObject({
            'X-Goog-Api-Client': 'gl-node/22.21.1',
          });
          expect(bodyText).toBe(
            JSON.stringify({
              metadata: {
                ide_name: 'antigravity',
                ide_type: 'ANTIGRAVITY',
                ide_version: '1.21.9',
              },
            })
          );
          return new Response('daily unavailable', { status: 503 });
        }

        if (url === 'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist') {
          return new Response(
            JSON.stringify({
              cloudaicompanionProject: { id: 'project-x' },
              paidTier: { id: 'g1-pro-tier' },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (url === 'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels') {
          return new Response(
            JSON.stringify({
              models: {
                'gemini-3-pro-high': {
                  quotaInfo: {
                    remainingFraction: 0.75,
                    resetTime: '2026-05-01T10:00:00Z',
                  },
                },
              },
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response('unexpected url', { status: 500 });
      }) as typeof fetch;

      try {
        const result = await fetchAccountQuota('agy', 'user@example.com');
        expect(result.success).toBe(true);
        expect(result.tier).toBe('pro');
        expect(result.projectId).toBe('project-x');
        expect(urls).toEqual([
          'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
          'https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
          'https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
        ]);
      } finally {
        globalThis.fetch = originalFetch;
      }
    } finally {
      if (originalCcsHome === undefined) {
        delete process.env.CCS_HOME;
      } else {
        process.env.CCS_HOME = originalCcsHome;
      }
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
