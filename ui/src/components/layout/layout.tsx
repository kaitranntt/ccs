import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { ThemeToggle } from './theme-toggle';
import { PrivacyToggle } from '@/components/shared/privacy-toggle';
import { GitHubLink } from '@/components/shared/github-link';
import { DocsLink } from '@/components/shared/docs-link';
import { ConnectionIndicator } from '@/components/shared/connection-indicator';
import { LocalhostDisclaimer } from '@/components/shared/localhost-disclaimer';
import { Skeleton } from '@/components/ui/skeleton';
import { ClaudeKitBadge } from '@/components/shared/claudekit-badge';
import { CcsBarButton } from '@/components/shared/ccs-bar-button';
import { SponsorButton } from '@/components/shared/sponsor-button';
import { ProjectSelectionDialog } from '@/components/shared/project-selection-dialog';
import { DeviceCodeDialog } from '@/components/shared/device-code-dialog';
import { UserMenu } from '@/components/auth/user-menu';
import { LanguageSwitcher } from './language-switcher';
import { useProjectSelection } from '@/hooks/use-project-selection';
import { useDeviceCode } from '@/hooks/use-device-code';
import { storeLastRoute } from '@/lib/last-route';

function PageLoader() {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const { isOpen, prompt, onSelect, onClose } = useProjectSelection();
  const deviceCode = useDeviceCode();

  useEffect(() => {
    storeLastRoute(location.pathname, location.search, location.hash);
  }, [location.pathname, location.search, location.hash]);

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
        <header className="flex h-14 items-center justify-between px-6 border-b shrink-0 bg-background shadow-sm z-20">
          <div className="flex items-center gap-3">
            <ClaudeKitBadge />
            <CcsBarButton />
            <SponsorButton />
          </div>
          <div className="flex items-center gap-2">
            <ConnectionIndicator />
            <LanguageSwitcher />
            <DocsLink />
            <GitHubLink />
            <PrivacyToggle />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <div className="flex-1 overflow-auto min-h-0">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </div>
        <LocalhostDisclaimer />
      </main>

      {/* Global project selection dialog for OAuth flows */}
      {prompt && (
        <ProjectSelectionDialog
          open={isOpen}
          onClose={onClose}
          sessionId={prompt.sessionId}
          provider={prompt.provider}
          projects={prompt.projects}
          defaultProjectId={prompt.defaultProjectId}
          supportsAll={prompt.supportsAll}
          onSelect={onSelect}
        />
      )}

      {/* Global device code dialog for Device Code OAuth flows (GitHub Copilot, Qwen) */}
      {deviceCode.prompt && (
        <DeviceCodeDialog
          open={deviceCode.isOpen}
          onClose={deviceCode.onClose}
          sessionId={deviceCode.prompt.sessionId}
          provider={deviceCode.prompt.provider}
          userCode={deviceCode.prompt.userCode}
          verificationUrl={deviceCode.prompt.verificationUrl}
          expiresAt={deviceCode.prompt.expiresAt}
        />
      )}
    </SidebarProvider>
  );
}
