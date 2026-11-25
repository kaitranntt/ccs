/**
 * WebSocket Hook (Phase 04)
 *
 * Manages WebSocket connection, auto-reconnect, and React Query invalidation.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface WSMessage {
  type: string;
  path?: string;
  timestamp?: number;
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useWebSocket() {
  const { t } = useTranslation();
  const tRef = useRef(t);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const handleMessage = useCallback(
    (message: WSMessage) => {
      switch (message.type) {
        case 'connected':
          console.log('[WS] Server acknowledged connection');
          break;

        case 'config-changed':
          queryClient.invalidateQueries({ queryKey: ['profiles'] });
          queryClient.invalidateQueries({ queryKey: ['cliproxy'] });
          toast.info(tRef.current('toasts.configUpdatedExternally'));
          break;

        case 'settings-changed':
          queryClient.invalidateQueries({ queryKey: ['profiles'] });
          toast.info(tRef.current('toasts.settingsFileUpdated'));
          break;

        case 'profiles-changed':
          queryClient.invalidateQueries({ queryKey: ['accounts'] });
          toast.info(tRef.current('toasts.accountsUpdated'));
          break;

        case 'proxy-status-changed':
          queryClient.invalidateQueries({ queryKey: ['proxy-status'] });
          break;

        case 'pong':
          // Heartbeat response
          break;

        default:
          console.log(`[WS] Unknown message: ${message.type}`);
      }
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setIsReconnecting(false);
      reconnectAttempts.current = 0;
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        handleMessage(message);

        // Dispatch custom event for other hooks to listen (e.g., project selection)
        window.dispatchEvent(new CustomEvent('ws-message', { detail: message }));
      } catch {
        console.log('[WS] Invalid message');
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Attempt reconnect with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        setIsReconnecting(true);
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
        // Use ref to avoid stale closure
        reconnectTimeoutRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
      } else {
        setIsReconnecting(false);
      }
    };

    ws.onerror = () => {
      console.log('[WS] Connection error');
    };
  }, [handleMessage]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    reconnectAttempts.current = maxReconnectAttempts; // Prevent reconnect
    setIsReconnecting(false);
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    wsRef.current?.close();
  }, []);

  // Initial connection
  useEffect(() => {
    connectRef.current();
    return () => disconnect();
  }, [disconnect]);

  // Heartbeat to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return useMemo(
    () => ({ status, isReconnecting, connect, disconnect }),
    [status, isReconnecting, connect, disconnect]
  );
}
