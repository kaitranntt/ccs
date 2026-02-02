/**
 * Add Account Dialog Component
 * Uses /start-url to get OAuth URL + polls for completion via management API.
 * Does NOT call /start (which spawns a CLIProxy binary and kills running instances).
 * Shows auth URL + callback paste field. Polling auto-closes on success.
 * For Kiro: Also shows "Import from IDE" option.
 */

import { useState, useEffect, useRef } from 'react';
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
import { Loader2, ExternalLink, User, Download, Copy, Check } from 'lucide-react';
import { useKiroImport } from '@/hooks/use-cliproxy';
import { useCliproxyAuthFlow } from '@/hooks/use-cliproxy-auth-flow';
import { applyDefaultPreset } from '@/lib/preset-utils';
import { toast } from 'sonner';

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  provider: string;
  displayName: string;
  /** Whether this is the first account being added (shows different toast message) */
  isFirstAccount?: boolean;
}

export function AddAccountDialog({
  open,
  onClose,
  provider,
  displayName,
  isFirstAccount = false,
}: AddAccountDialogProps) {
  const [nickname, setNickname] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const wasAuthenticatingRef = useRef(false);
  const authFlow = useCliproxyAuthFlow();
  const kiroImportMutation = useKiroImport();

  const isKiro = provider === 'kiro';
  const isPending = authFlow.isAuthenticating || kiroImportMutation.isPending;

  const resetAndClose = () => {
    setNickname('');
    setCallbackUrl('');
    setCopied(false);
    wasAuthenticatingRef.current = false;
    onClose();
  };

  // When authFlow completes successfully (polling detected success), apply preset and close
  useEffect(() => {
    if (!authFlow.isAuthenticating && !authFlow.error && authFlow.provider === null && open) {
      if (wasAuthenticatingRef.current) {
        wasAuthenticatingRef.current = false;
        const applyPresetAndClose = async () => {
          try {
            const result = await applyDefaultPreset(provider);
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
   * Authenticate via /start-url + polling only.
   * Does NOT call /start (which spawns a local CLIProxy binary that kills running instances).
   * /start-url uses the management API to get auth URL, then polls for completion.
   */
  const handleAuthenticate = () => {
    wasAuthenticatingRef.current = true;
    authFlow.startAuth(provider, { nickname: nickname.trim() || undefined });
  };

  const handleKiroImport = () => {
    wasAuthenticatingRef.current = true;
    kiroImportMutation.mutate(undefined, {
      onSuccess: async () => {
        const result = await applyDefaultPreset('kiro');
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
          <DialogTitle>Add {displayName} Account</DialogTitle>
          <DialogDescription>
            {isKiro
              ? 'Authenticate via browser or import an existing token from Kiro IDE.'
              : 'Click Authenticate to get an OAuth URL. Open it in any browser to sign in.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Nickname input - only show before auth starts */}
          {!showAuthUI && (
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname (optional)</Label>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="e.g., work, personal"
                  disabled={isPending}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                A friendly name to identify this account. Auto-generated from email if left empty.
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
                  Waiting for authentication...
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Complete the authentication in your browser. This dialog closes automatically.
                </p>
              </div>

              {/* Error from /start-url - fallback URL not available */}
              {authFlow.error && !authFlow.authUrl && (
                <p className="text-xs text-center text-destructive">{authFlow.error}</p>
              )}

              {/* Auth URL section - appears once /start-url returns */}
              {authFlow.authUrl && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Open this URL in any browser to sign in:</Label>
                    <div className="p-3 bg-muted rounded-md">
                      <p className="text-xs text-muted-foreground break-all font-mono line-clamp-3">
                        {authFlow.authUrl}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Button variant="outline" size="sm" onClick={handleCopyUrl}>
                          {copied ? (
                            <>
                              <Check className="w-3 h-3 mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            authFlow.authUrl && window.open(authFlow.authUrl, '_blank')
                          }
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Open
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Callback paste field */}
                  <div className="space-y-2">
                    <Label htmlFor="callback-url" className="text-xs">
                      Redirect didn&apos;t work? Paste the callback URL:
                    </Label>
                    <Input
                      id="callback-url"
                      value={callbackUrl}
                      onChange={(e) => setCallbackUrl(e.target.value)}
                      placeholder="Paste the redirect URL here..."
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
                          Submitting...
                        </>
                      ) : (
                        'Submit Callback'
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Kiro import loading */}
          {kiroImportMutation.isPending && (
            <p className="text-sm text-center text-muted-foreground">
              <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
              Importing token from Kiro IDE...
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
            {isKiro && !showAuthUI && (
              <Button variant="outline" onClick={handleKiroImport} disabled={isPending}>
                {kiroImportMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Import from IDE
                  </>
                )}
              </Button>
            )}
            {!showAuthUI && (
              <Button onClick={handleAuthenticate} disabled={isPending}>
                <ExternalLink className="w-4 h-4 mr-2" />
                Authenticate
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
