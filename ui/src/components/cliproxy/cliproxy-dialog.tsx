/**
 * CLIProxy Variant Dialog Component
 * Phase 03: REST API Routes & CRUD
 * Phase 05: Dashboard UI full CRUD for composite variants
 * Phase 06: Multi-Account Support
 */

import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useCreateVariant, useCliproxyAuth } from '@/hooks/use-cliproxy';
import { usePrivacy } from '@/contexts/privacy-context';
import { formatAccountDisplayName } from '@/lib/account-identity';
import { CLIPROXY_PROVIDERS, getProviderDisplayName } from '@/lib/provider-config';
import { isDeniedAgyModelId } from '@/lib/utils';

const singleProviderSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/, 'Invalid variant name'),
  provider: z.enum(CLIPROXY_PROVIDERS, { message: 'Provider is required' }),
  model: z.string().optional(),
  account: z.string().optional(),
  target: z.enum(['claude', 'droid']),
});

const compositeSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/, 'Invalid variant name'),
  default_tier: z.enum(['opus', 'sonnet', 'haiku'], { message: 'Default tier is required' }),
  target: z.enum(['claude', 'droid']),
  tiers: z.object({
    opus: z.object({
      provider: z.enum(CLIPROXY_PROVIDERS, { message: 'Provider is required' }),
      model: z.string().trim().min(1, 'Model is required'),
      account: z.string().optional(),
    }),
    sonnet: z.object({
      provider: z.enum(CLIPROXY_PROVIDERS, { message: 'Provider is required' }),
      model: z.string().trim().min(1, 'Model is required'),
      account: z.string().optional(),
    }),
    haiku: z.object({
      provider: z.enum(CLIPROXY_PROVIDERS, { message: 'Provider is required' }),
      model: z.string().trim().min(1, 'Model is required'),
      account: z.string().optional(),
    }),
  }),
});

type SingleProviderFormData = z.infer<typeof singleProviderSchema>;
type CompositeFormData = z.infer<typeof compositeSchema>;

interface CliproxyDialogProps {
  open: boolean;
  onClose: () => void;
}

const providerOptions = CLIPROXY_PROVIDERS.map((id) => ({
  value: id,
  label: getProviderDisplayName(id),
}));
const AGY_DENYLIST_MESSAGE =
  'Antigravity denylist: Claude Opus 4.5 and Claude Sonnet 4.5 are deprecated.';

function isDeniedAgyModelForProvider(provider: string, modelId: string | undefined): boolean {
  return provider === 'agy' && typeof modelId === 'string' && isDeniedAgyModelId(modelId);
}

export function CliproxyDialog({ open, onClose }: CliproxyDialogProps) {
  const { t } = useTranslation();
  const createMutation = useCreateVariant();
  const { data: authData } = useCliproxyAuth();
  const { privacyMode } = usePrivacy();
  const [mode, setMode] = useState<'single' | 'composite'>('single');

  const singleForm = useForm<SingleProviderFormData>({
    resolver: zodResolver(singleProviderSchema),
    defaultValues: { target: 'claude' },
  });

  const compositeForm = useForm<CompositeFormData>({
    resolver: zodResolver(compositeSchema),
    defaultValues: {
      default_tier: 'opus',
      target: 'claude',
      tiers: {
        opus: { provider: 'gemini', model: '' },
        sonnet: { provider: 'gemini', model: '' },
        haiku: { provider: 'gemini', model: '' },
      },
    },
  });

  const selectedProvider = useWatch({ control: singleForm.control, name: 'provider' });
  const providerAuth = authData?.authStatus.find((s) => s.provider === selectedProvider);
  const providerAccounts = providerAuth?.accounts || [];

  const onSubmitSingle = async (data: SingleProviderFormData) => {
    if (isDeniedAgyModelForProvider(data.provider, data.model)) {
      singleForm.setError('model', { message: AGY_DENYLIST_MESSAGE });
      toast.error(AGY_DENYLIST_MESSAGE);
      return;
    }

    try {
      await createMutation.mutateAsync(data);
      singleForm.reset();
      onClose();
    } catch (error) {
      console.error('Failed to create variant:', error);
    }
  };

  const onSubmitComposite = async (data: CompositeFormData) => {
    for (const tier of ['opus', 'sonnet', 'haiku'] as const) {
      const tierConfig = data.tiers[tier];
      if (!isDeniedAgyModelForProvider(tierConfig.provider, tierConfig.model)) continue;
      compositeForm.setError(`tiers.${tier}.model`, { message: AGY_DENYLIST_MESSAGE });
      toast.error(AGY_DENYLIST_MESSAGE);
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: data.name,
        provider: data.tiers[data.default_tier].provider,
        target: data.target,
        type: 'composite',
        default_tier: data.default_tier,
        tiers: data.tiers,
      });
      compositeForm.reset();
      onClose();
    } catch (error) {
      console.error('Failed to create composite variant:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create CLIProxy Variant</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'single' ? 'default' : 'outline'}
              onClick={() => setMode('single')}
            >
              Single Provider
            </Button>
            <Button
              type="button"
              variant={mode === 'composite' ? 'default' : 'outline'}
              onClick={() => setMode('composite')}
            >
              Composite (Multi-Provider)
            </Button>
          </div>

          {mode === 'single' ? (
            <form onSubmit={singleForm.handleSubmit(onSubmitSingle)} className="space-y-4">
              <div>
                <Label htmlFor="name">{t('cliproxyDialog.name')}</Label>
                <Input
                  id="name"
                  {...singleForm.register('name')}
                  placeholder={t('cliproxyDialog.placeholderName')}
                />
                {singleForm.formState.errors.name && (
                  <span className="text-xs text-red-500">
                    {singleForm.formState.errors.name.message}
                  </span>
                )}
              </div>

              <div>
                <Label htmlFor="provider">{t('cliproxyDialog.provider')}</Label>
                <select
                  id="provider"
                  {...singleForm.register('provider')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">{t('cliproxyDialog.selectProvider')}</option>
                  {providerOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {singleForm.formState.errors.provider && (
                  <span className="text-xs text-red-500">
                    {singleForm.formState.errors.provider.message}
                  </span>
                )}
              </div>

              {selectedProvider && providerAccounts.length > 0 && (
                <div>
                  <Label htmlFor="account">{t('cliproxyDialog.account')}</Label>
                  <select
                    id="account"
                    {...singleForm.register('account')}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">{t('cliproxyDialog.useDefaultAccount')}</option>
                    {providerAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {privacyMode
                          ? '••••••'
                          : formatAccountDisplayName(acc.id, acc.email, acc.tokenFile)}
                        {acc.isDefault ? ` ${t('cliproxyDialog.defaultSuffix')}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <Label htmlFor="model">{t('cliproxyDialog.modelOptional')}</Label>
                <Input
                  id="model"
                  {...singleForm.register('model')}
                  placeholder={t('cliproxyDialog.placeholderModel')}
                />
              </div>

              <div>
                <Label htmlFor="target">{t('cliproxyDialog.defaultTarget')}</Label>
                <select
                  id="target"
                  {...singleForm.register('target')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="claude">{t('cliproxyDialog.claudeCode')}</option>
                  <option value="droid">{t('cliproxyDialog.factoryDroid')}</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t('cliproxyDialog.cancel')}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending
                    ? t('cliproxyDialog.creating')
                    : t('cliproxyDialog.create')}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={compositeForm.handleSubmit(onSubmitComposite)} className="space-y-4">
              <div>
                <Label htmlFor="comp-name">{t('cliproxyDialog.name')}</Label>
                <Input
                  id="comp-name"
                  {...compositeForm.register('name')}
                  placeholder={t('cliproxyDialog.placeholderComposite')}
                />
                {compositeForm.formState.errors.name && (
                  <span className="text-xs text-red-500">
                    {compositeForm.formState.errors.name.message}
                  </span>
                )}
              </div>

              <div>
                <Label>{t('cliproxyDialog.tierConfig')}</Label>
                <Tabs defaultValue="opus" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="opus">{t('cliproxyDialog.opus')}</TabsTrigger>
                    <TabsTrigger value="sonnet">{t('cliproxyDialog.sonnet')}</TabsTrigger>
                    <TabsTrigger value="haiku">{t('cliproxyDialog.haiku')}</TabsTrigger>
                  </TabsList>
                  {(['opus', 'sonnet', 'haiku'] as const).map((tier) => (
                    <TabsContent key={tier} value={tier} className="space-y-3">
                      <div>
                        <Label htmlFor={`${tier}-provider`}>{t('cliproxyDialog.provider')}</Label>
                        <select
                          id={`${tier}-provider`}
                          {...compositeForm.register(`tiers.${tier}.provider`)}
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          {providerOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor={`${tier}-model`}>{t('cliproxyDialog.model')}</Label>
                        <Input
                          id={`${tier}-model`}
                          {...compositeForm.register(`tiers.${tier}.model`)}
                          placeholder={t('cliproxyDialog.placeholderModelId')}
                        />
                        {compositeForm.formState.errors.tiers?.[tier]?.model && (
                          <span className="text-xs text-red-500">
                            {compositeForm.formState.errors.tiers[tier]?.model?.message}
                          </span>
                        )}
                      </div>
                      <div>
                        <Label htmlFor={`${tier}-account`}>
                          {t('cliproxyDialog.accountOptional')}
                        </Label>
                        <Input
                          id={`${tier}-account`}
                          {...compositeForm.register(`tiers.${tier}.account`)}
                          placeholder={t('cliproxyDialog.placeholderAccountId')}
                        />
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>

              <div>
                <Label htmlFor="default-tier">{t('cliproxyDialog.defaultTier')}</Label>
                <select
                  id="default-tier"
                  {...compositeForm.register('default_tier')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="opus">{t('cliproxyDialog.opus')}</option>
                  <option value="sonnet">{t('cliproxyDialog.sonnet')}</option>
                  <option value="haiku">{t('cliproxyDialog.haiku')}</option>
                </select>
              </div>

              <div>
                <Label htmlFor="composite-target">{t('cliproxyDialog.defaultTarget')}</Label>
                <select
                  id="composite-target"
                  {...compositeForm.register('target')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="claude">{t('cliproxyDialog.claudeCode')}</option>
                  <option value="droid">{t('cliproxyDialog.factoryDroid')}</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {t('cliproxyDialog.cancel')}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending
                    ? t('cliproxyDialog.creating')
                    : t('cliproxyDialog.create')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
