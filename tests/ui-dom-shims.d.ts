// Ambient browser shims for test files that import UI helper modules under Node/Bun tsc.
interface Navigator {
  language?: string;
}

declare var window:
  | {
      localStorage: {
        getItem(key: string): string | null;
        setItem(key: string, value: string): void;
      };
    }
  | undefined;

declare module '*ccs-backlog-sync-lib.mjs';
