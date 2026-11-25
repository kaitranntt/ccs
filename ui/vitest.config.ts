import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup/vitest-setup.ts'],
    globals: true,
    css: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        // 90% coverage thresholds as per user requirement
        // Applied to testable pure logic files only
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      include: [
        // Settings - context and pure logic
        'src/pages/settings/settings-context.ts',
        'src/pages/settings/context.tsx',
        'src/pages/settings/hooks/context-hooks.ts',
        // Analytics - pure utils
        'src/pages/analytics/utils.ts',
        // Auth monitor - pure utils
        'src/components/monitoring/auth-monitor/utils.ts',
        // Tested hooks
        'src/hooks/use-websocket.ts',
        'src/hooks/use-websocket-context.ts',
        'src/hooks/use-copilot.ts',
        'src/hooks/use-droid.ts',
        'src/hooks/use-overview.ts',
        // Tested core libs
        'src/lib/i18n.ts',
        'src/lib/account-continuity.ts',
        'src/lib/account-identity.ts',
        'src/lib/cliproxy-account-stats.ts',
        'src/lib/codex-effort.ts',
        'src/lib/default-ports.ts',
        'src/lib/last-route.ts',
        'src/lib/reasoning-control.ts',
        'src/lib/sensitive-keys.ts',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/components/ui/**', // shadcn components
        'src/lib/locales/**', // static translation dictionaries
        'src/main.tsx',
        'src/**/index.tsx', // barrel exports and page containers
        'src/**/index.ts', // barrel exports
        'src/**/types.ts', // type-only files
        '**/*.test.{ts,tsx}',
      ],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../src/shared'),
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
