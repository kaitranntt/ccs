/**
 * WebSocket Context (Phase 04)
 */

import { createContext } from 'react';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface WSContextValue {
  status: ConnectionStatus;
  isReconnecting: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const WSContext = createContext<WSContextValue | null>(null);
