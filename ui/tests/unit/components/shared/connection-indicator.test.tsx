import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionIndicator } from '@/components/shared/connection-indicator';
import { WebSocketProvider } from '@/providers/websocket-provider';
import { AllProviders } from '../../../setup/test-utils';

class MockWebSocket {
  static readonly OPEN = 1;
  static instances: MockWebSocket[] = [];

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
}

describe('ConnectionIndicator & WebSocketProvider', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws when rendered outside WebSocketProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <AllProviders>
          <ConnectionIndicator />
        </AllProviders>
      )
    ).toThrow('useWebSocketContext must be used within WebSocketProvider');
    consoleError.mockRestore();
  });

  it('shares a single WebSocket connection across consumers inside WebSocketProvider', () => {
    render(
      <AllProviders>
        <WebSocketProvider>
          <ConnectionIndicator />
          <ConnectionIndicator />
        </WebSocketProvider>
      </AllProviders>
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(screen.getAllByText('Connecting...')).toHaveLength(2);

    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.readyState = MockWebSocket.OPEN;
      ws.onopen?.();
    });

    expect(screen.getAllByText('Connected')).toHaveLength(2);
  });
});
