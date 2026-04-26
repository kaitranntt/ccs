/**
 * Cursor Manual Auth Import Dialog
 * Access token + machine ID import for legacy Cursor authentication.
 */

import { Key, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ManualAuthDialogProps {
  open: boolean;
  manualToken: string;
  manualMachineId: string;
  isImporting: boolean;
  onOpenChange: (open: boolean) => void;
  onChangeToken: (value: string) => void;
  onChangeMachineId: (value: string) => void;
  onImport: () => void;
}

export function ManualAuthDialog({
  open,
  manualToken,
  manualMachineId,
  isImporting,
  onOpenChange,
  onChangeToken,
  onChangeMachineId,
  onImport,
}: ManualAuthDialogProps) {
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
              onChange={(e) => onChangeToken(e.target.value)}
              placeholder={t('cursorPage.accessTokenPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cursor-manual-machine-id">{t('cursorPage.machineId')}</Label>
            <Input
              id="cursor-manual-machine-id"
              value={manualMachineId}
              onChange={(e) => onChangeMachineId(e.target.value)}
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
