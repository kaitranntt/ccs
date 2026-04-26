/**
 * Page-level state hook for the cliproxy AI providers page.
 * Owns: family selection (URL-synced), entry selection, dialog/confirm state.
 */

import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type {
  AiProviderEntryView,
  AiProviderFamilyId,
  AiProviderFamilyState,
} from '../../../../../src/cliproxy/ai-providers';

export function useAiProvidersPage(families: AiProviderFamilyState[]) {
  const location = useLocation();
  const navigate = useNavigate();

  // URL-synced family selection
  const requestedFamily = useMemo(
    () => (new URLSearchParams(location.search).get('family') as AiProviderFamilyId | null) || null,
    [location.search]
  );
  const selectedFamily = useMemo<AiProviderFamilyId>(() => {
    if (requestedFamily && families.some((f) => f.id === requestedFamily)) return requestedFamily;
    return families[0]?.id ?? 'gemini-api-key';
  }, [families, requestedFamily]);

  const selectedFamilyState = useMemo(
    () => families.find((f) => f.id === selectedFamily) ?? null,
    [families, selectedFamily]
  );

  // Entry selection within a family
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const effectiveSelectedEntryId = useMemo(() => {
    const entries = selectedFamilyState?.entries ?? [];
    if (entries.length === 0) return null;
    if (selectedEntryId && entries.some((e) => e.id === selectedEntryId)) return selectedEntryId;
    return entries[0]?.id ?? null;
  }, [selectedEntryId, selectedFamilyState?.entries]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AiProviderEntryView | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<AiProviderEntryView | null>(null);

  const handleFamilySelect = (family: AiProviderFamilyId) => {
    navigate({ pathname: location.pathname, search: `?family=${family}` }, { replace: true });
  };

  const openCreateDialog = () => {
    setEditingEntry(null);
    setDialogOpen(true);
  };

  const openEditDialog = (entry: AiProviderEntryView) => {
    setEditingEntry(entry);
    setDialogOpen(true);
  };

  return {
    selectedFamily,
    selectedFamilyState,
    effectiveSelectedEntryId,
    setSelectedEntryId,
    dialogOpen,
    setDialogOpen,
    editingEntry,
    setEditingEntry,
    deleteEntry,
    setDeleteEntry,
    handleFamilySelect,
    openCreateDialog,
    openEditDialog,
  };
}
