import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AllProviders, createTestQueryClient } from '../../setup/test-utils';
import { useWebSocket } from '@/hooks/use-websocket';
import { toast } from 'sonner';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new Event('close') as CloseEvent);
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  emitMessage(data: unknown) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    this.onmessage?.({ data: raw } as MessageEvent);
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  emitError() {
    this.onerror?.(new Event('error'));
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.spyOn(toast, 'info').mockImplementation(() => '');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects, handles invalidation messages, dispatches ws-message, and sends heartbeat pings', () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wsEvents: CustomEvent[] = [];
    const listener = (event: Event) => wsEvents.push(event as CustomEvent);
    window.addEventListener('ws-message', listener);

    const wrapper = ({ children }: { children: ReactNode }) => (
      <AllProviders queryClient={queryClient}>{children}</AllProviders>
    );

    const { result, unmount } = renderHook(() => useWebSocket(), { wrapper });

    expect(result.current.status).toBe('connecting');
    expect(MockWebSocket.instances).toHaveLength(1);
    const socket = MockWebSocket.instances[0];

    act(() => {
      socket.emitOpen();
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      socket.emitMessage({ type: 'connected' });
      socket.emitMessage({ type: 'config-changed' });
      socket.emitMessage({ type: 'settings-changed' });
      socket.emitMessage({ type: 'profiles-changed' });
      socket.emitMessage({ type: 'proxy-status-changed' });
      socket.emitMessage({ type: 'pong' });
      socket.emitMessage('not-valid-json');
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['cliproxy'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['proxy-status'] });
    expect(toast.info).toHaveBeenCalledTimes(3);
    expect(wsEvents.map((e) => e.detail.type)).toEqual([
      'connected',
      'config-changed',
      'settings-changed',
      'profiles-changed',
      'proxy-status-changed',
      'pong',
    ]);

    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    window.removeEventListener('ws-message', listener);
    unmount();
  });

  it('reconnects with exponential backoff up to max attempts and stops after explicit disconnect', () => {
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AllProviders queryClient={queryClient}>{children}</AllProviders>
    );

    const { result } = renderHook(() => useWebSocket(), { wrapper });

    // Exhaust 5 reconnect attempts (1s, 2s, 4s, 8s, 16s)
    const delays = [1000, 2000, 4000, 8000, 16000];
    for (const delay of delays) {
      const current = MockWebSocket.instances[MockWebSocket.instances.length - 1];
      act(() => {
        current.emitError();
        current.emitClose();
      });
      expect(result.current.status).toBe('disconnected');
      expect(result.current.isReconnecting).toBe(true);
      act(() => {
        vi.advanceTimersByTime(delay);
      });
    }

    // 6th socket fails -> maxReconnectAttempts reached, stops reconnecting
    const lastSocket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      lastSocket.emitClose();
    });
    expect(result.current.isReconnecting).toBe(false);

    // Explicit connect + disconnect prevents reconnect
    act(() => {
      result.current.connect();
    });
    const manualSocket = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    act(() => {
      manualSocket.emitOpen();
      result.current.disconnect();
    });
    expect(result.current.status).toBe('disconnected');
    expect(result.current.isReconnecting).toBe(false);
  });
});
