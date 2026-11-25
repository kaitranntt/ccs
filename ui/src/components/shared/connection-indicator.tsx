/**
 * Connection Indicator (Phase 04)
 *
 * Shows WebSocket connection status in the header with reconnection state.
 */

import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useWebSocketContext } from '@/hooks/use-websocket-context';
import { useTranslation } from 'react-i18next';

export function ConnectionIndicator() {
  const { status, isReconnecting } = useWebSocketContext();
  const { t } = useTranslation();

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: 'text-green-600',
      label: t('connectionIndicator.connected'),
      animate: false,
    },
    connecting: {
      icon: RefreshCw,
      color: 'text-yellow-500',
      label: t('connectionIndicator.connecting'),
      animate: true,
    },
    disconnected: {
      icon: isReconnecting ? RefreshCw : WifiOff,
      color: isReconnecting ? 'text-amber-500' : 'text-red-500',
      label: isReconnecting
        ? t('connectionIndicator.reconnecting')
        : t('connectionIndicator.disconnected'),
      animate: isReconnecting,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1 text-sm ${config.color}`}>
      <Icon className={`w-4 h-4 ${config.animate ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{config.label}</span>
    </div>
  );
}
