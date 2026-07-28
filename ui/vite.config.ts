import type { ClientRequest, IncomingMessage } from 'node:http';
import { defineConfig } from 'vite';
import type { ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const UI_ROOT = __dirname;
const REPO_ROOT = path.resolve(__dirname, '..');
const BACKEND_ORIGIN = 'http://localhost:3000';
const TRUSTED_VITE_DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://[::1]:5173',
]);

function rewriteTrustedViteDevOrigin(proxyRequest: ClientRequest, request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (origin && TRUSTED_VITE_DEV_ORIGINS.has(origin)) {
    proxyRequest.setHeader('origin', BACKEND_ORIGIN);
  }
}

const configureHttpProxy: NonNullable<ProxyOptions['configure']> = (proxy) => {
  proxy.on('proxyReq', rewriteTrustedViteDevOrigin);
};

const configureWebSocketProxy: NonNullable<ProxyOptions['configure']> = (proxy) => {
  proxy.on('proxyReqWs', rewriteTrustedViteDevOrigin);
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@shared': path.resolve(REPO_ROOT, './src/shared'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - split large dependencies
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'radix-ui': [
            '@radix-ui/react-alert-dialog',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-collapsible',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-switch',
            '@radix-ui/react-tabs',
            '@radix-ui/react-tooltip',
          ],
          'tanstack': ['@tanstack/react-query', '@tanstack/react-table'],
          'form-utils': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'icons': ['lucide-react'],
          // Charts - large library, separate chunk
          'charts': ['recharts'],
          // Code editor / syntax highlighting
          'code-highlight': ['prism-react-renderer'],
          // Notifications
          'notifications': ['sonner'],
          // Utilities
          'utils': ['date-fns', 'clsx', 'class-variance-authority', 'tailwind-merge', 'yaml'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [UI_ROOT, REPO_ROOT],
    },
    proxy: {
      // Translate only trusted local Vite origins for the dashboard's CSRF guard.
      // Preserve every other Origin so the backend can reject untrusted callers.
      '/api': {
        target: BACKEND_ORIGIN,
        changeOrigin: true,
        configure: configureHttpProxy,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        changeOrigin: true,
        configure: configureWebSocketProxy,
      },
    },
  },
});
