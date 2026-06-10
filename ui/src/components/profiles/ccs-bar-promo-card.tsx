/**
 * CCS Bar Promo Card
 * Permanent promotional card for the native macOS menu-bar app, shown in the
 * providers sidebar footer.
 *
 * Rendered only on macOS: the install CTA has no effect elsewhere.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MonitorDot } from 'lucide-react';

// Lightweight, dependency-free macOS detection (see ccs-bar-banner.tsx).
const isMacOS =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || '');

interface CcsBarPromoCardProps {
  onInstallClick: () => void;
}

export function CcsBarPromoCard({ onInstallClick }: CcsBarPromoCardProps) {
  const { t } = useTranslation();

  if (!isMacOS) return null;

  return (
    <div className="p-3 border-t bg-gradient-to-r from-accent/5 to-accent/10 dark:from-accent/10 dark:to-accent/15">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-accent/10 dark:bg-accent/20 rounded shrink-0">
          <MonitorDot className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-accent dark:text-accent-foreground">
            {t('ccsBarPromo.title')}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {t('ccsBarPromo.description')}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onInstallClick}
          className="h-7 px-2 text-accent hover:text-accent hover:bg-accent/10 dark:hover:bg-accent/20"
        >
          <MonitorDot className="w-3 h-3 mr-1" />
          <span className="text-xs">{t('ccsBarPromo.install')}</span>
        </Button>
      </div>
    </div>
  );
}
