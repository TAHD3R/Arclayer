import { useMutation } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import * as authSsoApi from "@/api/auth-sso";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolveLoginMode } from "@/lib/auth/auth-mode";
import type { LoginMode } from "@/lib/auth/auth-mode";
import { ApiError } from "@/lib/http";
import {
  notifyError,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/lib/notifications";
import { queryClient } from "@/lib/query/query-client-instance";
import { resolvePostAuthRoute } from "@/lib/routing/bootstrap-routing";
import {
  getActiveAuthChallenge,
  isAuthChallengeExpired,
  rehydrateAuthChallengeStore,
  useAuthChallengeStore,
  type AuthChallengeSource,
} from "@/stores/use-auth-challenge-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { LoginFormValues, LoginTwoFactorFormValues, RegisterFormValues } from "../types";

const loginRouteApi = getRouteApi("/login/");
const TWO_FACTOR_REQUIRED_ERROR = "TWO_FACTOR_REQUIRED";
const CHALLENGE_INVALID_ERRORS = new Set([
  "TWO_FACTOR_CHALLENGE_INVALID",
  "TWO_FACTOR_CHALLENGE_EXPIRED",
]);

type TwoFactorChallengeMeta = {
  twoFactorToken: string;
  expiresIn: number;
};

function normalizeEditorRedirectPath(redirectTo: string): string {
  if (redirectTo === "/editor") return "/editor/";
  if (redirectTo.startsWith("/editor?")) return `/editor/${redirectTo.slice("/editor".length)}`;
  if (redirectTo.startsWith("/editor#")) return `/editor/${redirectTo.slice("/editor".length)}`;
  return redirectTo;
}

function resolveOAuthErrorMessage(errorCode: string, t: (key: string) => string): string {
  if (errorCode === "email_not_verified") return t("auth:OAUTH_ERROR_EMAIL_NOT_VERIFIED");
  if (errorCode === "provisioning_disabled") return t("auth:OAUTH_ERROR_PROVISIONING_DISABLED");
  return t("auth:OAUTH_ERROR_GENERIC");
}

function resolveTwoFactorChallengeMeta(error: ApiError): TwoFactorChallengeMeta | null {
  if (error.error !== TWO_FACTOR_REQUIRED_ERROR) return null;
  const meta = (error.meta ?? {}) as {
    twoFactorToken?: string;
    expiresIn?: number;
    two_factor_token?: string;
    expires_in?: number;
  };
  const twoFactorToken = meta.twoFactorToken ?? meta.two_factor_token;
  const expiresIn = meta.expiresIn ?? meta.expires_in;

  if (!twoFactorToken || typeof expiresIn !== "number" || expiresIn <= 0) {
    return null;
  }

  return { twoFactorToken, expiresIn };
}

function isChallengeInvalidationError(error: unknown): boolean {
  return (
    error instanceof ApiError && Boolean(error.error && CHALLENGE_INVALID_ERRORS.has(error.error))
  );
}

function isHandledTwoFactorError(error: unknown): error is ApiError {
  return error instanceof ApiError && resolveTwoFactorChallengeMeta(error) !== null;
}

export function useLoginPage() {
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const keepSession = useAuthStore((s) => s.keepSession);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const setChallenge = useAuthChallengeStore((s) => s.setChallenge);
  const clearChallenge = useAuthChallengeStore((s) => s.clear);
  const challengeTwoFactorToken = useAuthChallengeStore((s) => s.twoFactorToken);
  const challengeExpiresAt = useAuthChallengeStore((s) => s.expiresAt);
  const challengeKeepSession = useAuthChallengeStore((s) => s.keepSession);
  const challengeRedirect = useAuthChallengeStore((s) => s.redirect);
  const challengeSource = useAuthChallengeStore((s) => s.source);
  const activeChallenge = getActiveAuthChallenge({
    twoFactorToken: challengeTwoFactorToken,
    expiresAt: challengeExpiresAt,
    keepSession: challengeKeepSession,
    redirect: challengeRedirect,
    source: challengeSource,
  });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const runtime = useSystemRuntime();
  const runtimeReady = Boolean(runtime.runtime);

  const {
    redirect: redirectTo,
    mode = "login",
    oauth_code: oauthCode,
    oauth_error: oauthError,
  } = loginRouteApi.useSearch();

  const publicRegisterEnabled = runtime.publicRegisterEnabled !== false;
  const effectiveMode =
    runtime.publicRegisterEnabled === false ? resolveLoginMode(mode, false) : mode;

  const loginMutation = useMutation({
    mutationFn: async (values: LoginFormValues) =>
      authApi.login({ identifier: values.account, password: values.password }),
    onError: (error) => {
      if (isHandledTwoFactorError(error)) return;
      notifyError(error);
    },
  });

  const loginTwoFactorMutation = useMutation({
    mutationFn: async (values: { twoFactorToken: string; code?: string; backupCode?: string }) =>
      authApi.loginTwoFactor(values),
  });

  const registerMutation = useMutation({
    mutationFn: async (values: RegisterFormValues) =>
      authApi.register({
        username: values.username,
        email: values.email,
        password: values.password,
        confirm_password: values.confirmPassword,
      }),
  });

  const ssoExchangeMutation = useMutation({
    mutationFn: async (code: string) => authSsoApi.exchangeSSOCode(code),
    retry: false,
    meta: { silent: true },
  });

  const forgotPasswordMutation = useMutation({
    mutationFn: async (identifier: string) => authApi.forgotPassword({ identifier }),
  });

  const navigateAfterAuth = useCallback(
    async (redirectOverride?: string | null) => {
      const targetRedirect = redirectOverride ?? redirectTo;
      if (targetRedirect) {
        if (targetRedirect.startsWith("/editor")) {
          window.location.replace(normalizeEditorRedirectPath(targetRedirect));
          return;
        }
        await navigate({ to: targetRedirect, replace: true });
        return;
      }

      const decision = await resolvePostAuthRoute({ lastWorkspaceId, attemptRepair: true });
      if (decision.workspaceId) {
        setCurrentWorkspaceId(decision.workspaceId);
      }
      await navigate({ to: decision.path, replace: true });
    },
    [lastWorkspaceId, navigate, redirectTo, setCurrentWorkspaceId, t],
  );

  const startTwoFactorChallenge = useCallback(
    (
      error: unknown,
      options: { keepSession: boolean; redirect?: string | null; source: AuthChallengeSource },
    ) => {
      if (!(error instanceof ApiError)) return false;
      const challengeMeta = resolveTwoFactorChallengeMeta(error);
      if (!challengeMeta) return false;
      setChallenge({
        twoFactorToken: challengeMeta.twoFactorToken,
        expiresAt: Date.now() + challengeMeta.expiresIn * 1000,
        keepSession: options.keepSession,
        redirect: options.redirect ?? null,
        source: options.source,
      });
      return true;
    },
    [setChallenge],
  );

  useEffect(() => {
    void rehydrateAuthChallengeStore();
  }, []);

  useEffect(() => {
    if (!isAuthChallengeExpired(challengeExpiresAt)) return;
    if (!challengeTwoFactorToken) return;
    clearChallenge();
  }, [challengeExpiresAt, challengeTwoFactorToken, clearChallenge]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawRedirect = params.get("redirect");
    if (!rawRedirect) return;
    if (!redirectTo) {
      void navigate({ to: "/login", search: { mode: effectiveMode }, replace: true });
    }
  }, [effectiveMode, navigate, redirectTo]);

  useEffect(() => {
    if (runtime.publicRegisterEnabled !== false) return;
    if (mode !== "register") return;
    void navigate({
      to: "/login",
      search: { ...(redirectTo ? { redirect: redirectTo } : {}), mode: "login" },
      replace: true,
    });
  }, [mode, navigate, redirectTo, runtime.publicRegisterEnabled]);

  useEffect(() => {
    if (!oauthCode) return;
    const run = async () => {
      try {
        const tokens = await ssoExchangeMutation.mutateAsync(oauthCode);
        clearChallenge();
        applyLogin(tokens, { keepSession });
        void queryClient.cancelQueries();
        queryClient.clear();
        await navigateAfterAuth();
      } catch (error) {
        if (startTwoFactorChallenge(error, { keepSession, redirect: redirectTo, source: "sso" })) {
          return;
        }
        notifyError(error);
        void navigate({
          to: "/login",
          search: { redirect: redirectTo, mode: effectiveMode },
          replace: true,
        });
      }
    };
    void run();
  }, [
    applyLogin,
    clearChallenge,
    keepSession,
    effectiveMode,
    navigate,
    oauthCode,
    redirectTo,
    navigateAfterAuth,
    ssoExchangeMutation,
    startTwoFactorChallenge,
  ]);

  useEffect(() => {
    if (!oauthError) return;
    notifyErrorText(resolveOAuthErrorMessage(oauthError, t));
    void navigate({
      to: "/login",
      search: { redirect: redirectTo, mode: effectiveMode },
      replace: true,
    });
  }, [effectiveMode, navigate, oauthError, redirectTo, t]);

  const onModeChange = (next: LoginMode) => {
    const nextMode = resolveLoginMode(next, publicRegisterEnabled);
    void navigate({ to: "/login", search: { redirect: redirectTo, mode: nextMode } });
  };

  const onLoginFinish = async (values: LoginFormValues) => {
    try {
      const tokens = await loginMutation.mutateAsync(values);
      clearChallenge();
      applyLogin(tokens, { keepSession: values.keepSession });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth();
    } catch (error) {
      if (
        startTwoFactorChallenge(error, {
          keepSession: values.keepSession,
          redirect: redirectTo,
          source: "password",
        })
      ) {
        return;
      }
    }
  };

  const onLoginTwoFactorFinish = async (values: LoginTwoFactorFormValues) => {
    if (!activeChallenge) {
      clearChallenge();
      notifyErrorText(t("auth:TWO_FACTOR_CHALLENGE_EXPIRED"));
      return;
    }

    try {
      const tokens = await loginTwoFactorMutation.mutateAsync({
        twoFactorToken: activeChallenge.twoFactorToken,
        ...(values.code ? { code: values.code } : {}),
        ...(values.backupCode ? { backupCode: values.backupCode } : {}),
      });
      clearChallenge();
      applyLogin(tokens, { keepSession: activeChallenge.keepSession });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth(activeChallenge.redirect);
    } catch (error) {
      if (isChallengeInvalidationError(error)) {
        clearChallenge();
      }
    }
  };

  const onCancelTwoFactorChallenge = () => {
    clearChallenge();
    void navigate({
      to: "/login",
      search: { ...(redirectTo ? { redirect: redirectTo } : {}), mode: "login" },
      replace: true,
    });
  };

  const onForgotPassword = async (identifier: string) => {
    await forgotPasswordMutation.mutateAsync(identifier);
    notifyInfoText(t("auth:RESET_SENT"));
  };

  const onRegisterFinish = async (values: RegisterFormValues) => {
    if (!publicRegisterEnabled) return;
    try {
      await registerMutation.mutateAsync(values);
      const tokens = await loginMutation.mutateAsync({
        account: values.email || values.username,
        password: values.password,
        keepSession: true,
      });
      clearChallenge();
      applyLogin(tokens, { keepSession: true });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:REGISTER_SUCCESS"));
      await navigateAfterAuth();
    } catch (error) {
      if (
        startTwoFactorChallenge(error, {
          keepSession: true,
          redirect: redirectTo,
          source: "password",
        })
      ) {
        return;
      }
    }
  };

  const runtimeLoading = !runtimeReady;

  return {
    mode: effectiveMode,
    onModeChange,
    onLoginSubmit: onLoginFinish,
    loginLoading: loginMutation.isPending || ssoExchangeMutation.isPending,
    initialKeepSession: keepSession,
    redirect: redirectTo,
    onForgotPasswordSubmit: onForgotPassword,
    forgotPasswordLoading: forgotPasswordMutation.isPending,
    onRegisterSubmit: onRegisterFinish,
    registerLoading: registerMutation.isPending || runtimeLoading,
    publicRegisterEnabled,
    challenge: activeChallenge,
    onLoginTwoFactorSubmit: onLoginTwoFactorFinish,
    onCancelTwoFactorChallenge,
    twoFactorLoading: loginTwoFactorMutation.isPending,
  };
}
