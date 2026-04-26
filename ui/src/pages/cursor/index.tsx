/**
 * Cursor Page — root entry point.
 * Composes PageShell + useCursor hook + CursorForm.
 * All state and handler logic lives in CursorForm.
 */

import { PageShell } from '@/components/page-shell';
import { useCursor } from '@/hooks/use-cursor';
import { CursorForm } from './cursor-form';

export function CursorPage() {
  const cursor = useCursor();

  return (
    <PageShell>
      <div className="flex h-full min-h-0 overflow-hidden">
        <CursorForm
          status={cursor.status}
          statusLoading={cursor.statusLoading}
          config={cursor.config}
          models={cursor.models}
          modelsLoading={cursor.modelsLoading}
          currentModel={cursor.currentModel}
          rawSettings={cursor.rawSettings}
          rawSettingsLoading={cursor.rawSettingsLoading}
          probeResult={cursor.probeResult}
          isUpdatingConfig={cursor.isUpdatingConfig}
          isSavingRawSettings={cursor.isSavingRawSettings}
          isAutoDetectingAuth={cursor.isAutoDetectingAuth}
          isImportingManualAuth={cursor.isImportingManualAuth}
          isStartingDaemon={cursor.isStartingDaemon}
          isStoppingDaemon={cursor.isStoppingDaemon}
          isRunningProbe={cursor.isRunningProbe}
          refetchStatus={cursor.refetchStatus}
          refetchConfig={cursor.refetchConfig}
          refetchRawSettings={cursor.refetchRawSettings}
          updateConfigAsync={cursor.updateConfigAsync}
          saveRawSettingsAsync={cursor.saveRawSettingsAsync}
          autoDetectAuthAsync={cursor.autoDetectAuthAsync}
          importManualAuthAsync={cursor.importManualAuthAsync}
          startDaemonAsync={cursor.startDaemonAsync}
          stopDaemonAsync={cursor.stopDaemonAsync}
          runProbeAsync={cursor.runProbeAsync}
          resetProbe={cursor.resetProbe}
        />
      </div>
    </PageShell>
  );
}
