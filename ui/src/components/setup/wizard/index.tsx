/**
 * Quick Setup Wizard Component
 * Phase 03: Multi-account dashboard support
 *
 * Step-by-step wizard: Provider -> Auth -> Account -> Variant -> Success
 */

/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles } from 'lucide-react';
import {
  useCliproxyAuth,
  useCliproxyCatalog,
  useCreateVariant,
  useStartAuth,
  useCancelAuth,
} from '@/hooks/use-cliproxy';
import type { AuthStatus, OAuthAccount } from '@/lib/api-client';
import type { CLIProxyProvider } from '@/lib/provider-config';
import { applyDefaultPreset } from '@/lib/preset-utils';
import { buildUiCatalogs } from '@/lib/model-catalogs';
import i18n from '@/lib/i18n';
import { usePrivacy } from '@/contexts/privacy-context';
import { toast } from 'sonner';

import { PROVIDERS, ALL_STEPS, getStepProgress } from './constants';
import { ProgressIndicator } from './progress-indicator';
import { ProviderStep } from './steps/provider-step';
import { AuthStep } from './steps/auth-step';
import { AccountStep } from './steps/account-step';
import { VariantStep } from './steps/variant-step';
import { SuccessStep } from './steps/success-step';
import type { WizardStep, QuickSetupWizardProps } from './types';

export function QuickSetupWizard({ open, onClose }: QuickSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>('provider');
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<OAuthAccount | null>(null);
  const [variantName, setVariantName] = useState('');
  const [modelName, setModelName] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAddingNewAccount, setIsAddingNewAccount] = useState(false);

  const { data: authData, refetch } = useCliproxyAuth();
  const { data: catalogData } = useCliproxyCatalog();
  const createMutation = useCreateVariant();
  const startAuthMutation = useStartAuth();
  const cancelAuthMutation = useCancelAuth();
  const { privacyMode } = usePrivacy();

  // Get auth status for selected provider
  const providerAuth = authData?.authStatus.find(
    (s: AuthStatus) => s.provider === selectedProvider
  );
  const accounts = useMemo(() => providerAuth?.accounts || [], [providerAuth?.accounts]);
  const catalogs = useMemo(() => buildUiCatalogs(catalogData?.catalogs), [catalogData?.catalogs]);
  const fetchedCatalogsReady = Boolean(catalogData);

  // Reset on close
  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setStep('provider');
        setSelectedProvider('');
        setSelectedAccount(null);
        setVariantName('');
        setModelName('');
        setIsAddingNewAccount(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Auto-advance from auth step when account detected
  useEffect(() => {
    if (step === 'auth' && accounts.length > 0 && !isAddingNewAccount) {
      const timer = setTimeout(() => {
        setStep('account');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [step, accounts, isAddingNewAccount]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleStartAuth = () => {
    const isFirstAccount = (providerAuth?.accounts?.length || 0) === 0;

    startAuthMutation.mutate(
      { provider: selectedProvider },
      {
        onSuccess: async (data) => {
          if (isFirstAccount) {
            const result = await applyDefaultPreset(
              selectedProvider,
              undefined,
              fetchedCatalogsReady ? catalogs[selectedProvider] : undefined
            );
            if (result.success && result.presetName) {
              toast.success(`Applied "${result.presetName}" preset`);
            } else if (!result.success) {
              toast.warning(i18n.t('commonToast.accountAddedPresetFailed'));
            }
          }

          if (data.account) {
            setSelectedAccount(data.account as OAuthAccount);
            setStep('variant');
          }
          refetch();
        },
      }
    );
  };

  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    const auth = authData?.authStatus.find((s: AuthStatus) => s.provider === providerId);
    const provAccounts = auth?.accounts || [];

    if (provAccounts.length === 0) {
      setStep('auth');
    } else {
      setStep('account');
    }
  };

  const handleAccountSelect = (account: OAuthAccount) => {
    setSelectedAccount(account);
    setStep('variant');
  };

  const handleCreateVariant = async () => {
    if (!variantName || !selectedProvider) return;

    try {
      await createMutation.mutateAsync({
        name: variantName,
        provider: selectedProvider as CLIProxyProvider,
        model: modelName || undefined,
        account: selectedAccount?.id,
      });
      setStep('success');
    } catch (error) {
      console.error('Failed to create variant:', error);
    }
  };

  const authCommand = `ccs ${selectedProvider} --auth --add`;
  const currentProgress = getStepProgress(step);

  // Prevent accidental close when user has made progress
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      // Cancel any in-progress auth when closing
      if (startAuthMutation.isPending && selectedProvider) {
        cancelAuthMutation.mutate(selectedProvider);
      }
      if (step === 'success' || step === 'provider') {
        onClose();
        return;
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-lg"
        onPointerDownOutside={(e) => {
          if (step !== 'success' && step !== 'provider') {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (startAuthMutation.isPending || createMutation.isPending) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader className="min-w-0 px-6 pt-6 pr-12">
          <DialogTitle className="flex min-w-0 items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            {i18n.t('setupWizard.title')}
          </DialogTitle>
          <DialogDescription>
            {step === 'provider' && i18n.t('setupWizard.stepProviderDesc')}
            {step === 'auth' && i18n.t('setupWizard.stepAuthDesc')}
            {step === 'account' && i18n.t('setupWizard.stepAccountDesc')}
            {step === 'variant' && i18n.t('setupWizard.stepVariantDesc')}
            {step === 'success' && i18n.t('setupWizard.stepSuccessDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
          {step === 'provider' && (
            <ProviderStep providers={PROVIDERS} onSelect={handleProviderSelect} />
          )}

          {step === 'auth' && (
            <AuthStep
              selectedProvider={selectedProvider}
              providers={PROVIDERS}
              authCommand={authCommand}
              isRefreshing={isRefreshing}
              isPending={startAuthMutation.isPending}
              onBack={() => setStep('provider')}
              onStartAuth={handleStartAuth}
              onRefresh={handleRefresh}
            />
          )}

          {step === 'account' && (
            <AccountStep
              accounts={accounts}
              privacyMode={privacyMode}
              onSelect={handleAccountSelect}
              onAddNew={() => {
                setIsAddingNewAccount(true);
                setStep('auth');
              }}
              onBack={() => setStep('provider')}
            />
          )}

          {step === 'variant' && (
            <VariantStep
              selectedProvider={selectedProvider}
              catalog={catalogs[selectedProvider]}
              selectedAccount={selectedAccount}
              variantName={variantName}
              modelName={modelName}
              isPending={createMutation.isPending}
              privacyMode={privacyMode}
              onVariantNameChange={setVariantName}
              onModelChange={setModelName}
              onBack={() => (accounts.length > 0 ? setStep('account') : setStep('provider'))}
              onSkip={onClose}
              onCreate={handleCreateVariant}
            />
          )}

          {step === 'success' && <SuccessStep variantName={variantName} onClose={onClose} />}
        </div>

        <div className="px-6 pb-6">
          <ProgressIndicator currentProgress={currentProgress} allSteps={ALL_STEPS} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Re-exports
export { ProgressIndicator } from './progress-indicator';
export { ProviderStep } from './steps/provider-step';
export { AuthStep } from './steps/auth-step';
export { AccountStep } from './steps/account-step';
export { VariantStep } from './steps/variant-step';
export { SuccessStep } from './steps/success-step';
export { PROVIDERS, ALL_STEPS, getStepProgress } from './constants';
export type {
  WizardStep,
  QuickSetupWizardProps,
  ProviderOption,
  ProviderStepProps,
  AuthStepProps,
  AccountStepProps,
  VariantStepProps,
  SuccessStepProps,
  ProgressIndicatorProps,
} from './types';
