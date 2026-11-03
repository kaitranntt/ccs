/**
 * QwenCloud Coding Plan Promo Card
 * Permanent promotional card for QwenCloud Coding Plan in providers sidebar.
 */

import { Button } from '@/components/ui/button';
import { CloudCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AlibabaCodingPlanPromoCardProps {
  onCreateClick: () => void;
}

export function AlibabaCodingPlanPromoCard({ onCreateClick }: AlibabaCodingPlanPromoCardProps) {
  const { t } = useTranslation();

  return (
    <div className="p-3 border-t bg-gradient-to-r from-orange-500/5 to-orange-500/10 dark:from-orange-500/10 dark:to-orange-500/15">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-orange-500/10 dark:bg-orange-500/20 rounded shrink-0">
          <img src="/assets/providers/alibabacloud-color.svg" alt="" className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
            {t('alibabaCodingPlanPromo.title')}
          </p>
          <p className="text-[10px] text-muted-foreground truncate">
            {t('alibabaCodingPlanPromo.subtitle')}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCreateClick}
          className="h-7 px-2 text-orange-700 dark:text-orange-300 hover:text-orange-700 hover:bg-orange-500/10 dark:hover:bg-orange-500/20"
        >
          <CloudCog className="w-3 h-3 mr-1" />
          <span className="text-xs">{t('alibabaCodingPlanPromo.add')}</span>
        </Button>
      </div>
    </div>
  );
}
