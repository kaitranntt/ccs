/**
 * Account Flow Visualization
 * Custom SVG bezier curve visualization showing request flow from accounts to providers
 */

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { PROVIDER_COLORS } from '@/lib/provider-config';
import { usePrivacy } from '@/contexts/privacy-context';

import type { AccountFlowVizProps } from './types';
import { MAX_TIMELINE_EVENTS, buildConnectionEvents } from './utils';
import { calculateBezierPaths } from './path-utils';
import { splitAccountsIntoZones, getProviderSizeClass } from './zone-utils';
import { useDragPositions, useContainerExpansion, usePulseAnimation } from './hooks';
import { ConnectionTimeline } from './connection-timeline';
import { AccountCard } from './account-card';
import { ProviderCard } from './provider-card';
import { FlowPaths } from './flow-paths';
import { FlowVizHeader } from './flow-viz-header';

// Re-export types for backward compatibility
export type { AccountData, ProviderData, AccountFlowVizProps, ConnectionEvent } from './types';

const SHOW_PAUSED_STORAGE_KEY = 'ccs-auth-monitor-show-paused';

export function AccountFlowViz({
  providerData,
  recentRequests,
  onBack,
  onPauseToggle,
  isPausingAccount,
}: AccountFlowVizProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredAccount, setHoveredAccount] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showPausedAccounts, setShowPausedAccounts] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SHOW_PAUSED_STORAGE_KEY);
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });
  const [paths, setPaths] = useState<string[]>([]);

  const { privacyMode } = usePrivacy();
  const { accounts } = providerData;
  const pausedAccountsCount = useMemo(
    () => accounts.filter((account) => account.paused).length,
    [accounts]
  );
  const visibleAccounts = useMemo(
    () => (showPausedAccounts ? accounts : accounts.filter((account) => !account.paused)),
    [accounts, showPausedAccounts]
  );
  const visibleAccountIds = useMemo(
    () => new Set(visibleAccounts.map((account) => account.id)),
    [visibleAccounts]
  );
  const maxRequests = Math.max(...visibleAccounts.map((a) => a.successCount + a.failureCount), 1);
  const totalRequests = visibleAccounts.reduce(
    (acc, a) => acc + a.successCount + a.failureCount,
    0
  );
  const visibleProviderData = useMemo(
    () => ({
      ...providerData,
      accounts: visibleAccounts,
      totalRequests,
    }),
    [providerData, visibleAccounts, totalRequests]
  );

  const calculatePaths = useCallback(() => {
    const newPaths = calculateBezierPaths({ containerRef, svgRef, accounts: visibleAccounts });
    setPaths(newPaths);
  }, [visibleAccounts]);

  const storageKey = `ccs-flow-positions-${providerData.provider}`;
  const {
    dragOffsets,
    draggingId,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    getOffset,
    resetPositions,
    hasCustomPositions,
  } = useDragPositions({ storageKey, onDrag: calculatePaths });
  const visibleDragOffsets = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(dragOffsets).filter(([id]) => id === 'provider' || visibleAccountIds.has(id))
      ),
    [dragOffsets, visibleAccountIds]
  );
  const containerExpansion = useContainerExpansion(visibleDragOffsets);
  const hasVisibleCustomPositions = Object.keys(visibleDragOffsets).length > 0;
  const pulsingAccounts = usePulseAnimation(visibleAccounts);

  const connectionEvents = useMemo(
    () => buildConnectionEvents(recentRequests, visibleAccounts).slice(0, MAX_TIMELINE_EVENTS),
    [recentRequests, visibleAccounts]
  );

  useEffect(() => {
    const timer = setTimeout(calculatePaths, 50);
    window.addEventListener('resize', calculatePaths);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculatePaths);
    };
  }, [calculatePaths]);

  useEffect(() => {
    const timer = setTimeout(calculatePaths, 10);
    return () => clearTimeout(timer);
  }, [dragOffsets, calculatePaths]);

  useEffect(() => {
    const startTime = Date.now();
    const duration = 350;
    const animate = () => {
      calculatePaths();
      if (Date.now() - startTime < duration) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [showDetails, calculatePaths]);

  const providerColor = PROVIDER_COLORS[providerData.provider.toLowerCase()] || '#6b7280';
  const zones = useMemo(() => splitAccountsIntoZones(visibleAccounts), [visibleAccounts]);
  const { leftAccounts, rightAccounts, topAccounts, bottomAccounts } = zones;
  const hasRightAccounts = rightAccounts.length > 0;
  const hasTopAccounts = topAccounts.length > 0;
  const hasBottomAccounts = bottomAccounts.length > 0;
  const providerSize = useMemo(
    () => getProviderSizeClass(visibleAccounts.length),
    [visibleAccounts.length]
  );

  const renderAccountCards = (
    accountList: typeof visibleAccounts,
    zone: 'left' | 'right' | 'top' | 'bottom'
  ) =>
    accountList.map((account) => {
      const originalIndex = visibleAccounts.findIndex((a) => a.id === account.id);
      return (
        <AccountCard
          key={account.id}
          account={account}
          zone={zone}
          originalIndex={originalIndex}
          isHovered={hoveredAccount === originalIndex}
          isDragging={draggingId === account.id}
          offset={getOffset(account.id)}
          showDetails={showDetails}
          privacyMode={privacyMode}
          onMouseEnter={() => setHoveredAccount(originalIndex)}
          onMouseLeave={() => setHoveredAccount(null)}
          onPointerDown={(e) => handlePointerDown(account.id, e)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPauseToggle={onPauseToggle}
          isPausingAccount={isPausingAccount}
        />
      );
    });

  return (
    <div className="flex flex-col" ref={containerRef}>
      <FlowVizHeader
        onBack={onBack}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails(!showDetails)}
        showPausedAccounts={showPausedAccounts}
        pausedAccountsCount={pausedAccountsCount}
        onTogglePausedAccounts={() => {
          setHoveredAccount(null);
          const newValue = !showPausedAccounts;
          setShowPausedAccounts(newValue);
          if (typeof window !== 'undefined') {
            localStorage.setItem(SHOW_PAUSED_STORAGE_KEY, String(newValue));
          }
        }}
        hasCustomPositions={hasCustomPositions && hasVisibleCustomPositions}
        onResetPositions={resetPositions}
      />

      <div className="min-h-[320px] flex gap-4 px-4 py-6 self-stretch items-stretch transition-all duration-200">
        <div
          className="relative flex-1 flex flex-col items-stretch justify-center px-4"
          style={{
            paddingTop: `${24 + containerExpansion.paddingTop}px`,
            paddingBottom: `${24 + containerExpansion.paddingBottom}px`,
            minHeight: `${320 + containerExpansion.extraHeight}px`,
          }}
        >
          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible"
          >
            <FlowPaths
              paths={paths}
              accounts={visibleAccounts}
              maxRequests={maxRequests}
              hoveredAccount={hoveredAccount}
              pulsingAccounts={pulsingAccounts}
            />
          </svg>

          {hasTopAccounts && (
            <div className="flex flex-row gap-3 z-10 justify-center flex-wrap mb-8">
              {renderAccountCards(topAccounts, 'top')}
            </div>
          )}

          <div className="flex items-center justify-between gap-8 flex-1">
            <div className="flex flex-col gap-3 z-10 w-48 justify-center flex-shrink-0">
              {renderAccountCards(leftAccounts, 'left')}
            </div>

            <div className={cn('z-10 flex items-center flex-shrink-0', providerSize)}>
              <ProviderCard
                providerData={visibleProviderData}
                providerColor={providerColor}
                totalRequests={totalRequests}
                maxRequests={maxRequests}
                showVisibleMetrics={!showPausedAccounts && pausedAccountsCount > 0}
                hiddenPausedCount={showPausedAccounts ? 0 : pausedAccountsCount}
                isDragging={draggingId === 'provider'}
                offset={getOffset('provider')}
                hoveredAccount={hoveredAccount}
                hasRightAccounts={hasRightAccounts}
                hasTopAccounts={hasTopAccounts}
                hasBottomAccounts={hasBottomAccounts}
                onPointerDown={(e) => handlePointerDown('provider', e)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            </div>

            {hasRightAccounts && (
              <div className="flex flex-col gap-3 z-10 w-48 justify-center flex-shrink-0">
                {renderAccountCards(rightAccounts, 'right')}
              </div>
            )}
          </div>

          {hasBottomAccounts && (
            <div className="flex flex-row gap-3 z-10 justify-center flex-wrap mt-8">
              {renderAccountCards(bottomAccounts, 'bottom')}
            </div>
          )}
        </div>

        <div className="w-56 flex-shrink-0 self-stretch relative">
          <div className="absolute inset-0">
            <ConnectionTimeline events={connectionEvents} privacyMode={privacyMode} />
          </div>
        </div>
      </div>
    </div>
  );
}
