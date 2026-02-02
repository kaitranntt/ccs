/**
 * OAuth Auth Flow Hook for CLIProxy
 * Supports both auto-callback and manual callback flows
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { isValidProvider } from '@/lib/provider-config';

interface AuthFlowState {
  provider: string | null;
  isAuthenticating: boolean;
  error: string | null;
  /** Authorization URL for manual callback flow */
  authUrl: string | null;
  /** OAuth state parameter for polling */
  oauthState: string | null;
  /** Whether callback is being submitted */
  isSubmittingCallback: boolean;
}

interface StartAuthOptions {
  nickname?: string;
}

/** Polling interval for OAuth status check (3 seconds) */
const POLL_INTERVAL = 3000;
/** Maximum polling duration (5 minutes) */
const MAX_POLL_DURATION = 5 * 60 * 1000;

export function useCliproxyAuthFlow() {
  const [state, setState] = useState<AuthFlowState>({
    provider: null,
    isAuthenticating: false,
    error: null,
    authUrl: null,
    oauthState: null,
    isSubmittingCallback: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const queryClient = useQueryClient();

  // Clear polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      stopPolling();
    };
  }, [stopPolling]);

  // Poll OAuth status
  const pollStatus = useCallback(
    async (provider: string, oauthState: string) => {
      // Check timeout
      if (Date.now() - pollStartRef.current > MAX_POLL_DURATION) {
        stopPolling();
        setState((prev) => ({
          ...prev,
          isAuthenticating: false,
          error: 'Authentication timed out. Please try again.',
        }));
        return;
      }

      try {
        const response = await fetch(
          `/api/cliproxy/auth/${provider}/status?state=${encodeURIComponent(oauthState)}`
        );
        const data = await response.json();

        if (data.status === 'ok') {
          stopPolling();
          queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
          queryClient.invalidateQueries({ queryKey: ['account-quota'] });
          toast.success(`${provider} authentication successful`);
          setState({
            provider: null,
            isAuthenticating: false,
            error: null,
            authUrl: null,
            oauthState: null,
            isSubmittingCallback: false,
          });
        } else if (data.status === 'error') {
          stopPolling();
          const errorMsg = data.error || 'Authentication failed';
          toast.error(errorMsg);
          setState((prev) => ({
            ...prev,
            isAuthenticating: false,
            error: errorMsg,
          }));
        }
        // status === 'pending' means continue polling
      } catch {
        // Network error - continue polling
      }
    },
    [queryClient, stopPolling]
  );

  const startAuth = useCallback(
    async (provider: string, options?: StartAuthOptions) => {
      if (!isValidProvider(provider)) {
        setState({
          provider: null,
          isAuthenticating: false,
          error: `Unknown provider: ${provider}`,
          authUrl: null,
          oauthState: null,
          isSubmittingCallback: false,
        });
        return;
      }

      // Abort any in-progress auth
      abortControllerRef.current?.abort();
      stopPolling();

      // Create fresh controller and capture locally to avoid race with cancelAuth
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState({
        provider,
        isAuthenticating: true,
        error: null,
        authUrl: null,
        oauthState: null,
        isSubmittingCallback: false,
      });

      try {
        // Call start-url to get auth URL immediately (non-blocking)
        const response = await fetch(`/api/cliproxy/auth/${provider}/start-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nickname: options?.nickname }),
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to start OAuth');
        }

        // Update state with auth URL
        setState((prev) => ({
          ...prev,
          authUrl: data.authUrl,
          oauthState: data.state,
        }));

        // Auto-open auth URL in new browser tab (fallback URL still shown in dialog)
        if (data.authUrl) {
          window.open(data.authUrl, '_blank');
        }

        // Start polling for completion
        if (data.state) {
          pollStartRef.current = Date.now();
          pollIntervalRef.current = setInterval(() => {
            pollStatus(provider, data.state);
          }, POLL_INTERVAL);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          setState({
            provider: null,
            isAuthenticating: false,
            error: null,
            authUrl: null,
            oauthState: null,
            isSubmittingCallback: false,
          });
          return;
        }
        const message = error instanceof Error ? error.message : 'Authentication failed';
        toast.error(message);
        setState((prev) => ({
          ...prev,
          isAuthenticating: false,
          error: message,
        }));
      }
    },
    [pollStatus, stopPolling]
  );

  const cancelAuth = useCallback(() => {
    const currentProvider = state.provider;
    abortControllerRef.current?.abort();
    stopPolling();
    setState({
      provider: null,
      isAuthenticating: false,
      error: null,
      authUrl: null,
      oauthState: null,
      isSubmittingCallback: false,
    });
    // Also cancel on backend
    if (currentProvider) {
      api.cliproxy.auth.cancel(currentProvider).catch(() => {
        // Ignore errors - session may have already completed
      });
    }
  }, [state.provider, stopPolling]);

  const submitCallback = useCallback(
    async (redirectUrl: string) => {
      if (!state.provider) return;

      setState((prev) => ({ ...prev, isSubmittingCallback: true, error: null }));

      try {
        const response = await fetch(`/api/cliproxy/auth/${state.provider}/submit-callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redirectUrl }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          stopPolling();
          queryClient.invalidateQueries({ queryKey: ['cliproxy-auth'] });
          queryClient.invalidateQueries({ queryKey: ['account-quota'] });
          toast.success(`${state.provider} authentication successful`);
          setState({
            provider: null,
            isAuthenticating: false,
            error: null,
            authUrl: null,
            oauthState: null,
            isSubmittingCallback: false,
          });
        } else {
          throw new Error(data.error || 'Callback submission failed');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to submit callback';
        toast.error(message);
        setState((prev) => ({ ...prev, isSubmittingCallback: false, error: message }));
      }
    },
    [state.provider, queryClient, stopPolling]
  );

  return useMemo(
    () => ({
      ...state,
      startAuth,
      cancelAuth,
      submitCallback,
    }),
    [state, startAuth, cancelAuth, submitCallback]
  );
}
