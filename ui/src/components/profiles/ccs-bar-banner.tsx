/**
 * CCS Bar Feature Banner
 * Dismissible announcement banner promoting the native macOS menu-bar app.
 *
 * Rendered only on macOS: the CTA is an install action (`ccs bar install`) that
 * has no effect on other platforms, so showing it elsewhere would be misleading.
 */

/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MonitorDot, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BANNER_DISMISSED_KEY = 'ccs:ccs-bar-banner-dismissed';

// User-facing docs page for CCS Bar (flat Markdown in the ccs/cli docs tree).
const CCS_BAR_DOCS_URL = 'https://github.com/kaitranntt/ccs/blob/main/docs/ccs-bar.md';

// Lightweight, dependency-free macOS detection. Kept inline because no other
// component needs platform detection; a shared hook would be premature.
const isMacOS =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || '');

interface CcsBarBannerProps {
  onInstallClick?: () => void;
}

export function CcsBarBanner({ onInstallClick }: CcsBarBannerProps) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(true); // Start hidden to avoid flash

  // Check localStorage on mount
  useEffect(() => {
    const isDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  if (!isMacOS) return null;
  if (dismissed) return null;

  return (
    <div className="bg-gradient-to-r from-accent to-accent/90 text-white px-4 py-3 relative shrink-0">
      <div className="flex items-center justify-between gap-4 max-w-screen-xl mx-auto">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="p-1.5 bg-white/20 rounded-md shrink-0">
            <MonitorDot className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">
              {t('ccsBarBanner.new')}: {t('ccsBarBanner.title')}
            </p>
            <p className="text-xs text-white/80 truncate">
              {t('ccsBarBanner.description')}{' '}
              <code className="bg-white/15 rounded px-1 py-0.5 font-mono text-[11px]">
                ccs bar install
              </code>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onInstallClick && (
            <Button
              size="sm"
              variant="secondary"
              onClick={onInstallClick}
              className="bg-white text-accent hover:bg-white/90 h-8"
            >
              {t('ccsBarBanner.install')}
            </Button>
          )}
          <a
            href={CCS_BAR_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-white/80 hover:text-white hidden sm:flex items-center gap-1"
          >
            Learn more
            <ExternalLink className="w-3 h-3" />
          </a>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="h-7 w-7 text-white/70 hover:text-white hover:bg-white/20"
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
