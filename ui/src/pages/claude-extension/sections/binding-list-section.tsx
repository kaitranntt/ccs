/**
 * BindingListSection — Read-only list of saved bindings in the left panel.
 *
 * Each row is a clickable button that transitions the editor into view/edit
 * mode for that binding. Renders an empty-state card when no bindings exist.
 */
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ClaudeExtensionBinding } from '@/hooks/use-claude-extension';

interface BindingListItemProps {
  binding: ClaudeExtensionBinding;
  isSelected: boolean;
  onSelect: () => void;
}

function BindingListItem({ binding, isSelected, onSelect }: BindingListItemProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border px-3 py-3 text-left transition-colors',
        isSelected
          ? 'border-primary/40 bg-primary/10'
          : 'border-border/60 bg-card hover:bg-muted/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{binding.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {binding.profile} · {binding.host}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {binding.usesDefaultIdeSettingsPath ? 'Default path' : 'Custom path'}
        </Badge>
      </div>
    </button>
  );
}

interface BindingListSectionProps {
  bindings: ClaudeExtensionBinding[];
  /** id of the currently selected binding, or null when creating */
  selectedBindingId: string | null;
  creating: boolean;
  onSelect: (binding: ClaudeExtensionBinding) => void;
}

export function BindingListSection({
  bindings,
  selectedBindingId,
  creating,
  onSelect,
}: BindingListSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('claudeExtensionPage.savedBindings', { defaultValue: 'Saved bindings' })}
      </div>
      <div className="space-y-2">
        {bindings.length > 0 ? (
          bindings.map((binding) => (
            <BindingListItem
              key={binding.id}
              binding={binding}
              isSelected={binding.id === selectedBindingId && !creating}
              onSelect={() => onSelect(binding)}
            />
          ))
        ) : (
          <Card className="border-dashed border-border/60 bg-card/60">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              {t('claudeExtensionPage.emptyBindings', {
                defaultValue:
                  'No saved bindings yet. Create one to manage apply, reset, and drift checks from the dashboard.',
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
