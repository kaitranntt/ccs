/**
 * Settings Page
 * Main entry point with lazy-loaded sections and URL tab persistence
 */

import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  Component,
  type ReactNode,
  type ComponentType,
} from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { RefreshCw, FileCode, Copy, Check, GripVertical, AlertCircle } from 'lucide-react';
import { SettingsProvider } from './context';
import { useSettingsTab, useRawConfig } from './hooks';
import { TabNavigation } from './components/tab-navigation';
import { SectionSkeleton } from './components/section-skeleton';
import type { SettingsTab } from './types';
import { useTranslation } from 'react-i18next';
import i18n from '@/lib/i18n';

const CodeEditor = lazy(() =>
  import('@/components/shared/code-editor').then((m) => ({ default: m.CodeEditor }))
);

/**
 * Retry wrapper for dynamic imports with exponential backoff
 * Handles temporary network failures gracefully
 */
function retryImport<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
  retries = 3,
  delay = 1000
): Promise<{ default: T }> {
  return importFn().catch((error: Error) => {
    if (retries <= 0) throw error;
    return new Promise((resolve) => setTimeout(resolve, delay)).then(() =>
      retryImport(importFn, retries - 1, delay * 2)
    );
  });
}

/** Lazy load with automatic retry on failure */
function lazyWithRetry<T extends ComponentType<unknown>>(importFn: () => Promise<{ default: T }>) {
  return lazy(() => retryImport(importFn));
}

// Lazy-loaded sections with retry capability
const WebSearchSection = lazyWithRetry(() => import('./sections/websearch'));
const BrowserSection = lazyWithRetry(() => import('./sections/browser'));
const ImageAnalysisSection = lazyWithRetry(() => import('./sections/image-analysis'));
const ChannelsSection = lazyWithRetry(() => import('./sections/channels'));
const GlobalEnvSection = lazyWithRetry(() => import('./sections/globalenv-section'));
const ThinkingSection = lazyWithRetry(() => import('./sections/thinking'));
const ProxySection = lazyWithRetry(() => import('./sections/proxy'));
const AuthSection = lazyWithRetry(() => import('./sections/auth-section'));
const BackupsSection = lazyWithRetry(() => import('./sections/backups-section'));

// Error Boundary for lazy-loaded sections
class SectionErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center p-6 max-w-md">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <p className="font-medium text-foreground mb-2">
              {i18n.t('settings.sectionLoadFailed')}
            </p>
            <p className="text-sm mb-4">
              {this.state.error?.message || i18n.t('settings.unknownError')}
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {i18n.t('settings.reloadPage')}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function resolveSettingsTab(tabParam: string | null | undefined): SettingsTab {
  switch (tabParam?.toLowerCase()) {
    case 'browser':
      return 'browser';
    case 'imageanalysis':
    case 'image':
      return 'image';
    case 'channels':
      return 'channels';
    case 'globalenv':
      return 'globalenv';
    case 'proxy':
      return 'proxy';
    case 'auth':
      return 'auth';
    case 'thinking':
      return 'thinking';
    case 'backups':
      return 'backups';
    default:
      return 'websearch';
  }
}

// Inner component that uses context
function SettingsPageInner() {
  const { t } = useTranslation();
  const { setActiveTab } = useSettingsTab();
  const [searchParams] = useSearchParams();
  const activeTab = resolveSettingsTab(searchParams.get('tab'));
  const {
    rawConfig,
    loading: rawConfigLoading,
    copied,
    fetchRawConfig,
    copyToClipboard,
  } = useRawConfig();

  // Fetch raw config on mount
  useEffect(() => {
    fetchRawConfig();
  }, [fetchRawConfig]);

  const handleTabChange = (tab: SettingsTab) => {
    startTransition(() => {
      setActiveTab(tab);
    });
  };

  return (
    <div className="h-full min-h-0">
      {/* Mobile View - Stacked vertically */}
      <div className="md:hidden h-full flex flex-col">
        <div className="border-b bg-background p-4">
          <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
        <SectionErrorBoundary>
          <Suspense fallback={<SectionSkeleton />}>
            {activeTab === 'browser' && <BrowserSection />}
            {activeTab === 'websearch' && <WebSearchSection />}
            {activeTab === 'image' && <ImageAnalysisSection />}
            {activeTab === 'channels' && <ChannelsSection />}
            {activeTab === 'globalenv' && <GlobalEnvSection />}
            {activeTab === 'thinking' && <ThinkingSection />}
            {activeTab === 'proxy' && <ProxySection />}
            {activeTab === 'auth' && <AuthSection />}
            {activeTab === 'backups' && <BackupsSection />}
          </Suspense>
        </SectionErrorBoundary>
      </div>

      {/* Desktop View - Side-by-side panels */}
      <PanelGroup direction="horizontal" className="h-full hidden md:flex">
        {/* Left Panel - Settings Controls */}
        <Panel defaultSize={46} minSize={36} maxSize={62}>
          <div className="h-full border-r flex flex-col bg-muted/30 relative">
            {/* Header with Tabs */}
            <div className="p-5 border-b bg-background">
              <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
            </div>

            {/* Tab Content */}
            <SectionErrorBoundary>
              <Suspense fallback={<SectionSkeleton />}>
                {activeTab === 'browser' && <BrowserSection />}
                {activeTab === 'websearch' && <WebSearchSection />}
                {activeTab === 'image' && <ImageAnalysisSection />}
                {activeTab === 'channels' && <ChannelsSection />}
                {activeTab === 'globalenv' && <GlobalEnvSection />}
                {activeTab === 'thinking' && <ThinkingSection />}
                {activeTab === 'proxy' && <ProxySection />}
                {activeTab === 'auth' && <AuthSection />}
                {activeTab === 'backups' && <BackupsSection />}
              </Suspense>
            </SectionErrorBoundary>
          </div>
        </Panel>

        {/* Resize Handle */}
        <PanelResizeHandle className="w-2 bg-border hover:bg-primary/20 transition-colors cursor-col-resize flex items-center justify-center group">
          <GripVertical className="w-3 h-3 text-muted-foreground group-hover:text-primary" />
        </PanelResizeHandle>

        {/* Right Panel - Config Viewer */}
        <Panel defaultSize={54} minSize={35}>
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="p-4 border-b bg-background flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCode className="w-5 h-5 text-primary" />
                <div>
                  {/* TODO i18n: missing key for "config.yaml" header */}
                  <h2 className="font-semibold">config.yaml</h2>
                  {/* TODO i18n: missing key for "~/.ccs/config.yaml" path */}
                  <p className="text-sm text-muted-foreground">~/.ccs/config.yaml</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={copyToClipboard} disabled={!rawConfig}>
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      {t('settings.copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      {t('settings.copy')}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchRawConfig}
                  disabled={rawConfigLoading}
                >
                  <RefreshCw className={`w-4 h-4 ${rawConfigLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {/* Config Content - scrollable */}
            <div className="flex-1 overflow-auto">
              {rawConfig ? (
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                      {t('settings.loading')}
                    </div>
                  }
                >
                  <CodeEditor
                    value={rawConfig}
                    onChange={() => {}}
                    language="yaml"
                    readonly
                    minHeight="auto"
                    className="min-h-full"
                  />
                </Suspense>
              ) : rawConfigLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                  {t('settings.loading')}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <div className="text-center">
                    <FileCode className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>{t('settings.configFileNotFound')}</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                      ccs migrate
                    </code>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

// Main export with context provider
export function SettingsPage() {
  return (
    <SettingsProvider>
      <SettingsPageInner />
    </SettingsProvider>
  );
}
