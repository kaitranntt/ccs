/**
 * CCS Bar Button
 *
 * Compact navbar link for the native macOS menu-bar app docs.
 */

import { MonitorDot } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const CCS_BAR_DOCS_URL = 'https://docs.ccs.kaitran.ca/features/dashboard/ccs-bar';

export function CcsBarButton() {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          asChild
          className="h-8 gap-1.5 border-accent/40 bg-accent/5 px-2.5 text-accent hover:bg-accent hover:text-accent-foreground"
        >
          <a
            href={CCS_BAR_DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            title={t('ccsBarButton.title')}
          >
            <MonitorDot className="w-4 h-4" />
            <span className="hidden text-xs font-bold sm:inline">{t('ccsBarButton.label')}</span>
          </a>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-64">
        {t('ccsBarButton.tooltip')}
      </TooltipContent>
    </Tooltip>
  );
}
