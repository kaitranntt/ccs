/**
 * Vitest Setup
 * Global test configuration and matchers
 */

import '../../src/lib/i18n';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Mock matchMedia for components that use media queries
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver with a constructible class for Radix/Floating UI usage
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

// CodeMirror uses Range.getClientRects() for cursor measurement, which JSDOM
// does not implement. Polyfill it with empty rects so the editor mounts cleanly.
if (typeof Range !== 'undefined') {
  Range.prototype.getClientRects =
    Range.prototype.getClientRects ||
    function getClientRects() {
      return {
        item: () => null,
        length: 0,
        [Symbol.iterator]: function* () {},
      } as unknown as DOMRectList;
    };
  Range.prototype.getBoundingClientRect =
    Range.prototype.getBoundingClientRect ||
    function getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
