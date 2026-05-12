/**
 * Add Account Dialog Component
 * Uses /start-url to get OAuth URL + polls for completion via management API.
 * For Device Code flows (ghcp, qwen, kiro): Uses /start endpoint which spawns CLIProxy
 * binary and emits WebSocket events. DeviceCodeDialog handles user code display.
 * Shows auth URL + callback paste field. Polling auto-closes on success.
 * For Kiro: Also shows "Import from IDE" option.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, ExternalLink, User, Download, Copy, Check, ShieldAlert } from 'lucide-react';
import { useKiroImport } from '@/hooks/use-cliproxy';
import { useCliproxyAuthFlow } from '@/hooks/use-cliproxy-auth-flow';
import { applyDefaultPreset } from '@/lib/preset-utils';
import type { CliproxyProviderCatalog } from '@/lib/api-client';
import { AccountSafetyWarningCard } from '@/components/account/account-safety-warning-card';
import { AntigravityResponsibilityChecklist } from '@/components/account/antigravity-responsibility-checklist';
import {
  ANTIGRAVITY_ACK_VERSION,
  DEFAULT_ANTIGRAVITY_RISK_CHECKLIST,
  RISK_ACK_PHRASE,
  isAntigravityRiskChecklistComplete,
} from '@/components/account/antigravity-responsibility-constants';
import {
  DEFAULT_KIRO_AUTH_METHOD,
  DEFAULT_KIRO_IDC_FLOW,
  getKiroEffectiveFlowType,
  getKiroEffectiveStartEndpoint,
  getKiroAuthMethodOption,
  isKiroSocialAuthMethod,
  isDeviceCodeProvider,
  KIRO_AUTH_METHOD_OPTIONS,
} from '@/lib/provider-config';
import type { KiroAuthMethod, KiroIDCFlow } from '@/lib/provider-config';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  provider: string;
  displayName: string;
  catalog?: CliproxyProviderCatalog;
  /** Whether this is the first account being added (shows different toast message) */
  isFirstAccount?: boolean;
}

function normalizeRiskPhrase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toUpperCase();
}

interface PowerUserModeSyncOptions {
  pendingMessage?: string | null;
  disabledMessage?: string | null;
}

export function AddAccountDialog({
  open,
  onClose,
  provider,
  displayName,
  catalog,
  isFirstAccount = false,
}: AddAccountDialogProps) {
  const [nickname, setNickname] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [riskAcknowledgementText, setRiskAcknowledgementText] = useState('');
  const [agyRiskChecklist, setAgyRiskChecklist] = useState(DEFAULT_ANTIGRAVITY_RISK_CHECKLIST);
  const [powerUserModeEnabled, setPowerUserModeEnabled] = useState(false);
  const [powerUserModeLoading, setPowerUserModeLoading] = useState(false);
  const [kiroAuthMethod, setKiroAuthMethod] = useState<KiroAuthMethod>(DEFAULT_KIRO_AUTH_METHOD);
  const [kiroIDCStartUrl, setKiroIDCStartUrl] = useState('');
  const [kiroIDCRegion, setKiroIDCRegion] = useState('');
  const [kiroIDCFlow, setKiroIDCFlow] = useState<KiroIDCFlow>(DEFAULT_KIRO_IDC_FLOW);
  const [gitlabAuthMode, setGitlabAuthMode] = useState<'oauth' | 'pat'>('oauth');
  const [gitlabBaseUrl, setGitlabBaseUrl] = useState('');
  const [gitlabPersonalAccessToken, setGitlabPersonalAccessToken] = useState('');
  const { t } = useTranslation();
  const wasAuthenticatingRef = useRef(false);
  const powerUserModeRequestIdRef = useRef(0);
  const powerUserModeLoadErrorShownRef = useRef(false);
  const authFlow = useCliproxyAuthFlow();
  const kiroImportMutation = useKiroImport();

  const isKiro = provider === 'kiro';
  const isGitLab = provider === 'gitlab';
  const supportsPowerUserMode = provider === 'agy' || provider === 'gemini';
  const requiresGeminiSafetyAcknowledgement = provider === 'gemini' && !powerUserModeEnabled;
  const requiresAgyResponsibilityFlow = provider === 'agy' && !powerUserModeEnabled;
  const isPowerUserModePending = supportsPowerUserMode && powerUserModeLoading;
  const isAgyRiskChecklistComplete = isAntigravityRiskChecklistComplete(agyRiskChecklist);
  const isGeminiRiskAcknowledged = normalizeRiskPhrase(riskAcknowledgementText) === RISK_ACK_PHRASE;
  const defaultDeviceCode = isDeviceCodeProvider(provider);
  const kiroMethodOption = getKiroAuthMethodOption(kiroAuthMethod);
  const isKiroIdc = isKiro && kiroAuthMethod === 'idc';
  const isKiroSocial = isKiro && isKiroSocialAuthMethod(kiroAuthMethod);
  const selectedKiroFlowType = isKiro
    ? getKiroEffectiveFlowType(kiroAuthMethod, kiroIDCFlow)
    : undefined;
  const selectedKiroStartEndpoint = isKiro
    ? getKiroEffectiveStartEndpoint(kiroAuthMethod)
    : undefined;
  const isDeviceCode = isKiro ? selectedKiroFlowType === 'device_code' : defaultDeviceCode;
  const isPending = authFlow.isAuthenticating || kiroImportMutation.isPending;
  const nicknameTrimmed = nickname.trim();
  const kiroIDCStartUrlTrimmed = kiroIDCStartUrl.trim();
  const kiroIDCRegionTrimmed = kiroIDCRegion.trim();
  const gitlabBaseUrlTrimmed = gitlabBaseUrl.trim();
  const gitlabPersonalAccessTokenTrimmed = gitlabPersonalAccessToken.trim();
  const errorMessage = localError || authFlow.error;

  const fetchPowerUserModeState = useCallback(async (): Promise<boolean> => {
    const response = await fetch('/api/settings/auth/antigravity-risk');
    if (!response.ok) {
      throw new Error('Failed to load power user mode setting');
    }
    const data = (await response.json()) as { antigravityAckBypass?: boolean };
    return data.antigravityAckBypass === true;
  }, []);

  const syncPowerUserModeState = useCallback(
    async ({ pendingMessage = null, disabledMessage = null }: PowerUserModeSyncOptions = {}) => {
      const requestId = ++powerUserModeRequestIdRef.current;
      setPowerUserModeLoading(true);

      if (pendingMessage !== null) {
        setLocalError(pendingMessage);
      }

      try {
        const enabled = await fetchPowerUserModeState();
        if (powerUserModeRequestIdRef.current !== requestId) {
          return enabled;
        }

        setPowerUserModeEnabled(enabled);

        if (disabledMessage) {
          setLocalError(enabled ? null : disabledMessage);
        } else if (pendingMessage !== null) {
          setLocalError(null);
        }

        return enabled;
      } catch {
        if (powerUserModeRequestIdRef.current !== requestId) {
          return false;
        }

        setPowerUserModeEnabled(false);
        setLocalError(disabledMessage ?? t('addAccountDialog.powerUserLoadFailed'));

        if (!powerUserModeLoadErrorShownRef.current) {
          powerUserModeLoadErrorShownRef.current = true;
          toast.error(t('addAccountDialog.powerUserLoadFailed'));
        }

        return false;
      } finally {
        if (powerUserModeRequestIdRef.current === requestId) {
          setPowerUserModeLoading(false);
        }
      }
    },
    [fetchPowerUserModeState, t]
  );

  const resetAndClose = () => {
    setNickname('');
    setCallbackUrl('');
    setCopied(false);
    setLocalError(null);
    setRiskAcknowledgementText('');
    setAgyRiskChecklist(DEFAULT_ANTIGRAVITY_RISK_CHECKLIST);
    setPowerUserModeEnabled(false);
    setPowerUserModeLoading(false);
    setKiroAuthMethod(DEFAULT_KIRO_AUTH_METHOD);
    setKiroIDCStartUrl('');
    setKiroIDCRegion('');
    setKiroIDCFlow(DEFAULT_KIRO_IDC_FLOW);
    setGitlabAuthMode('oauth');
    setGitlabBaseUrl('');
    setGitlabPersonalAccessToken('');
    powerUserModeRequestIdRef.current += 1;
    powerUserModeLoadErrorShownRef.current = false;
    wasAuthenticatingRef.current = false;
    onClose();
  };

  useEffect(() => {
    if (open) {
      setRiskAcknowledgementText('');
      setAgyRiskChecklist(DEFAULT_ANTIGRAVITY_RISK_CHECKLIST);
      setLocalError(null);
    }
  }, [provider, open]);

  useEffect(() => {
    return () => {
      powerUserModeRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!open || !supportsPowerUserMode) {
      powerUserModeRequestIdRef.current += 1;
      setPowerUserModeEnabled(false);
      setPowerUserModeLoading(false);
      return;
    }

    void syncPowerUserModeState();
  }, [open, provider, supportsPowerUserMode, syncPowerUserModeState]);

  useEffect(() => {
    if (!open || provider !== 'agy' || !authFlow.error || !powerUserModeEnabled) {
      return;
    }

    const normalizedError = authFlow.error.toLowerCase();
    const ackRequired =
      normalizedError.includes('agy_risk_ack_required') ||
      normalizedError.includes('responsibility acknowledgement') ||
      normalizedError.includes('responsibility checklist');
    if (!ackRequired) return;

    void syncPowerUserModeState({
      pendingMessage: t('addAccountDialog.powerUserLoading'),
      disabledMessage: t('addAccountDialog.powerUserUnavailableRetry'),
    });
  }, [authFlow.error, open, powerUserModeEnabled, provider, syncPowerUserModeState, t]);

  // When authFlow completes successfully (polling detected success), apply preset and close
  useEffect(() => {
    if (!authFlow.isAuthenticating && !authFlow.error && authFlow.provider === null && open) {
      if (wasAuthenticatingRef.current) {
        wasAuthenticatingRef.current = false;
        const applyPresetAndClose = async () => {
          try {
            const result = await applyDefaultPreset(provider, undefined, catalog);
            if (result.success && result.presetName && isFirstAccount) {
              toast.success(`Applied "${result.presetName}" preset`);
            }
          } catch {
            // Continue to close dialog even if preset apply fails
          }
          resetAndClose();
        };
        applyPresetAndClose();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authFlow.isAuthenticating, authFlow.error, authFlow.provider]);

  const handleCancel = () => {
    // Always cancel authFlow (handles its own no-op if not active)
    authFlow.cancelAuth();
    resetAndClose();
  };

  const handleCopyUrl = async () => {
    if (authFlow.authUrl) {
      await navigator.clipboard.writeText(authFlow.authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmitCallback = () => {
    if (callbackUrl.trim()) {
      authFlow.submitCallback(callbackUrl.trim());
    }
  };

  /**
   * Start auth flow using provider capabilities.
   * - Verification-code providers use /start and WebSocket events for code display.
   * - Browser URL providers use /start-url and polling.
   */
  const handleAuthenticate = () => {
    if (isPowerUserModePending) {
      setLocalError(t('addAccountDialog.powerUserLoading'));
      return;
    }
    if (requiresAgyResponsibilityFlow && !isAgyRiskChecklistComplete) {
      setLocalError(
        // TODO i18n: missing key for AGY responsibility error
        'Complete all Antigravity responsibility steps before authenticating this provider.'
      );
      return;
    }
    if (requiresGeminiSafetyAcknowledgement && !isGeminiRiskAcknowledged) {
      setLocalError(
        `Type "${RISK_ACK_PHRASE}" to acknowledge the account safety warning before authenticating this provider.`
      );
      return;
    }
    setLocalError(null);
    if (isKiroIdc && !kiroIDCStartUrlTrimmed) {
      setLocalError('IDC Start URL is required for Kiro IAM Identity Center login.');
      return;
    }
    if (isGitLab && gitlabAuthMode === 'pat' && !gitlabPersonalAccessTokenTrimmed) {
      setLocalError(t('addAccountDialog.gitlabPatRequired'));
      return;
    }
    wasAuthenticatingRef.current = true;
    authFlow.startAuth(provider, {
      nickname: nicknameTrimmed || undefined,
      kiroMethod: isKiro ? kiroAuthMethod : undefined,
      kiroIDCStartUrl: isKiroIdc ? kiroIDCStartUrlTrimmed : undefined,
      kiroIDCRegion: isKiroIdc && kiroIDCRegionTrimmed ? kiroIDCRegionTrimmed : undefined,
      kiroIDCFlow: isKiroIdc ? kiroIDCFlow : undefined,
      gitlabAuthMode: isGitLab ? gitlabAuthMode : undefined,
      gitlabBaseUrl: isGitLab && gitlabBaseUrlTrimmed ? gitlabBaseUrlTrimmed : undefined,
      gitlabPersonalAccessToken:
        isGitLab && gitlabAuthMode === 'pat' && gitlabPersonalAccessTokenTrimmed
          ? gitlabPersonalAccessTokenTrimmed
          : undefined,
      flowType: isKiro ? selectedKiroFlowType : undefined,
      startEndpoint: isKiro
        ? selectedKiroStartEndpoint
        : isGitLab && gitlabAuthMode === 'pat'
          ? 'start'
          : undefined,
      riskAcknowledgement: requiresAgyResponsibilityFlow
        ? {
            version: ANTIGRAVITY_ACK_VERSION,
            reviewedIssue509: agyRiskChecklist.reviewedIssue509,
            understandsBanRisk: agyRiskChecklist.understandsBanRisk,
            acceptsFullResponsibility: agyRiskChecklist.acceptsFullResponsibility,
            typedPhrase: agyRiskChecklist.typedPhrase,
          }
        : undefined,
    });
  };

  const handleKiroImport = () => {
    wasAuthenticatingRef.current = true;
    kiroImportMutation.mutate(undefined, {
      onSuccess: async () => {
        const result = await applyDefaultPreset('kiro', undefined, catalog);
        if (result.success && result.presetName && isFirstAccount) {
          toast.success(`Applied "${result.presetName}" preset`);
        }
        resetAndClose();
      },
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      handleCancel();
    }
  };

  const showAuthUI = authFlow.isAuthenticating;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          // Prevent accidental close by clicking outside during auth
          if (showAuthUI) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('addAccountDialog.title', { displayName })}</DialogTitle>
          <DialogDescription>
            {isKiro
              ? t('addAccountDialog.descKiro')
              : isDeviceCode
                ? t('addAccountDialog.descDeviceCode')
                : t('addAccountDialog.descOauth')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {requiresAgyResponsibilityFlow && !showAuthUI && (
            <AntigravityResponsibilityChecklist
              value={agyRiskChecklist}
              onChange={(value) => {
                setAgyRiskChecklist(value);
                setLocalError(null);
              }}
              disabled={isPending}
            />
          )}

          {supportsPowerUserMode && powerUserModeEnabled && !showAuthUI && (
            <div className="rounded-lg border border-amber-400/35 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-100">
              <div className="mb-1.5 flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="h-3.5 w-3.5" />
                {t('addAccountDialog.powerUserEnabled')}
              </div>
              {t('addAccountDialog.powerUserSkipped')}
            </div>
          )}

          {requiresGeminiSafetyAcknowledgement && !showAuthUI && (
            <AccountSafetyWarningCard
              showAcknowledgement
              acknowledgementPhrase={RISK_ACK_PHRASE}
              acknowledgementText={riskAcknowledgementText}
              onAcknowledgementTextChange={(value) => {
                setRiskAcknowledgementText(value);
                setLocalError(null);
              }}
              disabled={isPending}
            />
          )}

          {/* Kiro auth method */}
          {isKiro && !showAuthUI && (
            <div className="space-y-2">
              <Label htmlFor="kiro-auth-method">{t('addAccountDialog.authMethod')}</Label>
              <Select
                value={kiroAuthMethod}
                onValueChange={(value) => {
                  setKiroAuthMethod(value as KiroAuthMethod);
                  setLocalError(null);
                }}
              >
                <SelectTrigger id="kiro-auth-method">
                  <SelectValue placeholder={t('addAccountDialog.selectKiroAuthMethod')} />
                </SelectTrigger>
                <SelectContent>
                  {KIRO_AUTH_METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{kiroMethodOption.description}</p>
              {isKiroSocial && (
                <p className="text-xs text-muted-foreground">
                  {/* TODO i18n: missing key for Kiro social browser hint */}
                  If your browser does not return automatically after login, CCS can accept the
                  final
                  <span className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    kiro://...
                  </span>
                  callback URL in the next step.
                </p>
              )}
            </div>
          )}

          {isKiroIdc && !showAuthUI && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="space-y-2">
                <Label htmlFor="kiro-idc-start-url">
                  {/* TODO i18n: missing key */}IDC Start URL
                </Label>
                <Input
                  id="kiro-idc-start-url"
                  value={kiroIDCStartUrl}
                  onChange={(e) => {
                    setKiroIDCStartUrl(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="https://d-xxx.awsapps.com/start"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  {/* TODO i18n: missing key */}Required for organization IAM Identity Center login.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kiro-idc-region">{/* TODO i18n: missing key */}IDC Region</Label>
                <Input
                  id="kiro-idc-region"
                  value={kiroIDCRegion}
                  onChange={(e) => {
                    setKiroIDCRegion(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder="us-east-1"
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  {/* TODO i18n: missing key */}Optional. Leave blank to use the upstream default
                  region.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="kiro-idc-flow">{/* TODO i18n: missing key */}IDC Flow</Label>
                <Select
                  value={kiroIDCFlow}
                  onValueChange={(value) => {
                    setKiroIDCFlow(value as KiroIDCFlow);
                    setLocalError(null);
                  }}
                >
                  <SelectTrigger id="kiro-idc-flow">
                    <SelectValue placeholder="{/* TODO i18n: missing key */}Select IDC flow" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="authcode">
                      {/* TODO i18n: missing key */}Authorization Code
                    </SelectItem>
                    <SelectItem value="device">
                      {/* TODO i18n: missing key */}Device Code
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {/* TODO i18n: missing key */}Auth Code opens a browser and may need the final
                  callback URL pasted back. Device Code shows a verification code instead.
                </p>
              </div>
            </div>
          )}

          {isGitLab && !showAuthUI && (
            <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="space-y-2">
                <Label htmlFor="gitlab-auth-mode">{t('addAccountDialog.gitlabAuthMethod')}</Label>
                <Select
                  value={gitlabAuthMode}
                  onValueChange={(value) => {
                    setGitlabAuthMode(value as 'oauth' | 'pat');
                    setLocalError(null);
                  }}
                >
                  <SelectTrigger id="gitlab-auth-mode">
                    <SelectValue placeholder={t('addAccountDialog.selectGitlabAuthMethod')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oauth">{t('addAccountDialog.gitlabAuthOAuth')}</SelectItem>
                    <SelectItem value="pat">{t('addAccountDialog.gitlabAuthPat')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t('addAccountDialog.gitlabAuthHint')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gitlab-base-url">{t('addAccountDialog.gitlabUrl')}</Label>
                <Input
                  id="gitlab-base-url"
                  value={gitlabBaseUrl}
                  onChange={(e) => {
                    setGitlabBaseUrl(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder={t('addAccountDialog.gitlabUrlPlaceholder')}
                  disabled={isPending}
                />
                <p className="text-xs text-muted-foreground">
                  {t('addAccountDialog.gitlabUrlHint')}
                </p>
              </div>

              {gitlabAuthMode === 'pat' && (
                <div className="space-y-2">
                  <Label htmlFor="gitlab-pat">{t('addAccountDialog.gitlabPat')}</Label>
                  <Input
                    id="gitlab-pat"
                    type="password"
                    value={gitlabPersonalAccessToken}
                    onChange={(e) => {
                      setGitlabPersonalAccessToken(e.target.value);
                      setLocalError(null);
                    }}
                    placeholder={t('addAccountDialog.gitlabPatPlaceholder')}
                    disabled={isPending}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('addAccountDialog.gitlabPatHint')} <span className="font-mono">api</span> and{' '}
                    <span className="font-mono">read_user</span> scopes.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Nickname input - only show before auth starts */}
          {!showAuthUI && (
            <div className="space-y-2">
              <Label htmlFor="nickname">{t('addAccountDialog.nicknameOptional')}</Label>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value);
                    setLocalError(null);
                  }}
                  placeholder={t('addAccountDialog.nicknamePlaceholder')}
                  disabled={isPending}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('addAccountDialog.nicknameOptionalHint')}
              </p>
            </div>
          )}

          {/* Unified auth state: spinner + auth URL + callback paste */}
          {showAuthUI && (
            <div className="space-y-4">
              {/* Spinner */}
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                  {t('addAccountDialog.waitingForAuth')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {authFlow.isDeviceCodeFlow
                    ? t('addAccountDialog.deviceCodeHint')
                    : isKiroSocial
                      ? // TODO i18n: missing key for Kiro social callback hint
                        'Complete sign-in in your browser. If it does not return automatically, paste the final kiro:// callback URL below.'
                      : t('addAccountDialog.browserHint')}
                </p>
              </div>

              {/* Auth URL section - only for Authorization Code flows, NOT Device Code */}
              {authFlow.authUrl && !authFlow.isDeviceCodeFlow && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">{t('addAccountDialog.openUrlLabel')}</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs text-muted-foreground break-all font-mono line-clamp-3">
                        {authFlow.authUrl}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                          {copied ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              {t('addAccountDialog.copied')}
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              {t('addAccountDialog.copy')}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (!authFlow.authUrl) return;
                            const popup = window.open(authFlow.authUrl, '_blank');
                            if (!popup || popup.closed || typeof popup.closed === 'undefined') {
                              toast.warning(t('addAccountDialog.popupBlocked'), { duration: 5000 });
                            }
                          }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {t('addAccountDialog.open')}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Callback paste field */}
                  <div className="space-y-2">
                    <Label htmlFor="callback-url" className="text-xs">
                      {isKiroSocial
                        ? // TODO i18n: missing key
                          'Browser did not return? Paste the final kiro:// callback URL:'
                        : t('addAccountDialog.redirectPasteLabel')}
                    </Label>
                    <Input
                      id="callback-url"
                      value={callbackUrl}
                      onChange={(e) => setCallbackUrl(e.target.value)}
                      placeholder={
                        isKiroSocial
                          ? 'kiro://kiro.kiroAgent/authenticate-success?code=...&state=...'
                          : t('addAccountDialog.callbackPlaceholder')
                      }
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSubmitCallback}
                      disabled={!callbackUrl.trim() || authFlow.isSubmittingCallback}
                    >
                      {authFlow.isSubmittingCallback ? (
                        <>
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          {t('addAccountDialog.submitting')}
                        </>
                      ) : (
                        t('addAccountDialog.submitCallback')
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {!authFlow.authUrl && !authFlow.isDeviceCodeFlow && (
                <p className="text-xs text-center text-muted-foreground">
                  {isKiroSocial
                    ? // TODO i18n: missing key for Kiro social preparing URL
                      'Preparing the Kiro sign-in URL. If it does not open automatically, it will appear here shortly.'
                    : t('addAccountDialog.preparingUrl')}
                </p>
              )}
            </div>
          )}

          {/* Persist error visibility outside auth-only UI states */}
          {errorMessage && (
            <p className="text-xs text-center text-destructive whitespace-pre-line">
              {errorMessage}
            </p>
          )}

          {/* Kiro import loading */}
          {kiroImportMutation.isPending && (
            <p className="text-sm text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
              {t('addAccountDialog.importingToken')}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleCancel}>
              {t('addAccountDialog.cancel')}
            </Button>
            {isKiro && !showAuthUI && (
              <Button variant="outline" onClick={handleKiroImport} disabled={isPending}>
                {kiroImportMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {t('addAccountDialog.importing')}
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    {t('addAccountDialog.importFromIde')}
                  </>
                )}
              </Button>
            )}
            {!showAuthUI && (
              <Button
                onClick={handleAuthenticate}
                disabled={
                  isPending ||
                  isPowerUserModePending ||
                  (requiresAgyResponsibilityFlow && !isAgyRiskChecklistComplete) ||
                  (requiresGeminiSafetyAcknowledgement && !isGeminiRiskAcknowledged)
                }
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('addAccountDialog.authenticate')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
