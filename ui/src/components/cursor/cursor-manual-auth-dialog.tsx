import { Key, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function CursorManualAuthDialog({
  open,
  onOpenChange,
  manualToken,
  onManualTokenChange,
  manualMachineId,
  onManualMachineIdChange,
  isImporting,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  manualToken: string;
  onManualTokenChange: (value: string) => void;
  manualMachineId: string;
  onManualMachineIdChange: (value: string) => void;
  isImporting: boolean;
  onImport: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cursorPage.manualImportTitle')}</DialogTitle>
          <DialogDescription>{t('cursorPage.manualImportDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cursor-manual-token">{t('cursorPage.accessToken')}</Label>
            <Input
              id="cursor-manual-token"
              value={manualToken}
              onChange={(e) => onManualTokenChange(e.target.value)}
              placeholder={t('cursorPage.accessTokenPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cursor-manual-machine-id">{t('cursorPage.machineId')}</Label>
            <Input
              id="cursor-manual-machine-id"
              value={manualMachineId}
              onChange={(e) => onManualMachineIdChange(e.target.value)}
              placeholder={t('cursorPage.machineIdPlaceholder')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cursorPage.cancel')}
          </Button>
          <Button onClick={onImport} disabled={isImporting}>
            {isImporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Key className="w-4 h-4 mr-2" />
            )}
            {t('cursorPage.import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
