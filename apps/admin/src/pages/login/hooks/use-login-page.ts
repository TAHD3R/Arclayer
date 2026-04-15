import { useMutation } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import * as authSsoApi from "@/api/auth-sso";
import * as systemApi from "@/api/system";
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
import { resolvePostAuthRoute } from "@/lib/routing/post-auth-routing";
import {
  getActiveAuthChallenge,
  isAuthChallengeExpired,
  rehydrateAuthChallengeStore,
  useAuthChallengeStore,
  type AuthChallengeSource,
} from "@/stores/use-auth-challenge-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type {
  BootstrapFormValues,
  BootstrapPaneProps,
  InstanceRepairRequiredPaneProps,
  LoginEmailLookupResult,
  LoginEmailCodeFormValues,
  LoginEmailCodePaneSeed,
  LoginFormValues,
  LoginModeChangeOptions,
  LoginPaneSeed,
  LoginTwoFactorFormValues,
  LoginViewProps,
  RegisterFormValues,
  RegisterPaneSeed,
} from "../types";

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

const OAUTH_SEARCH_CONSUME_DEDUPE_WINDOW_MS = 2_000;
const oauthSearchFlagHandledAt = new Map<string, number>();

function shouldHandleOAuthSearchFlag(flag: "oauth_code" | "oauth_error", value: string): boolean {
  const key = `${flag}:${value}`;
  const now = Date.now();
  const lastHandledAt = oauthSearchFlagHandledAt.get(key);
  oauthSearchFlagHandledAt.set(key, now);
  if (lastHandledAt === undefined) return true;
  return now - lastHandledAt > OAUTH_SEARCH_CONSUME_DEDUPE_WINDOW_MS;
}

function consumeLoginSearchFlag(flag: "oauth_code" | "oauth_error", value: string): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get(flag) !== value) return;
  params.delete(flag);
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

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

type LoginPageState =
  | { entry: "auth"; props: LoginViewProps }
  | { entry: "bootstrap"; props: BootstrapPaneProps }
  | { entry: "repair_required"; props: InstanceRepairRequiredPaneProps };

export function useLoginPage(): LoginPageState {
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
  const [loginSeed, setLoginSeed] = useState<LoginPaneSeed | null>(null);
  const [loginEmailCodeSeed, setLoginEmailCodeSeed] = useState<LoginEmailCodePaneSeed | null>(null);
  const [registerSeed, setRegisterSeed] = useState<RegisterPaneSeed | null>(null);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string | undefined>(undefined);
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

  const emailCheckMutation = useMutation({
    mutationFn: async (email: string) => authApi.emailCheck({ email }),
    onError: notifyError,
  });
  const loginMutation = useMutation({
    mutationFn: async (values: LoginFormValues) =>
      authApi.login({ email: values.email, password: values.password }),
    onError: (error) => {
      if (isHandledTwoFactorError(error)) return;
      notifyError(error);
    },
  });
  const loginEmailCodeRequestMutation = useMutation({
    mutationFn: async (email: string) => authApi.requestLoginEmailCode({ email }),
  });
  const loginEmailCodeVerifyMutation = useMutation({
    mutationFn: async (values: LoginEmailCodeFormValues) =>
      authApi.verifyLoginEmailCode({ email: values.email, code: values.code }),
    onError: (error) => {
      if (isHandledTwoFactorError(error)) return;
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
        display_name: values.displayName.trim(),
      }),
    onError: notifyError,
  });
  const bootstrapMutation = useMutation({
    mutationFn: async (values: BootstrapFormValues) =>
      systemApi.bootstrapInstance({
        username: values.username,
        email: values.email,
        password: values.password,
        display_name: values.displayName.trim(),
      }),
    onError: notifyError,
  });
  const ssoExchangeMutation = useMutation({
    mutationFn: async (code: string) => authSsoApi.exchangeSSOCode(code),
    retry: false,
    meta: { silent: true },
  });
  const forgotPasswordMutation = useMutation({
    mutationFn: async (email: string) => authApi.forgotPassword({ email }),
    onError: notifyError,
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

      const decision = await resolvePostAuthRoute({ lastWorkspaceId });
      if (decision.workspaceId) {
        setCurrentWorkspaceId(decision.workspaceId);
      }
      await navigate({ to: decision.path, replace: true });
    },
    [lastWorkspaceId, navigate, redirectTo, setCurrentWorkspaceId],
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
    setRegisterSeed(null);
    void navigate({
      to: "/login",
      search: { ...(redirectTo ? { redirect: redirectTo } : {}), mode: "login" },
      replace: true,
    });
  }, [mode, navigate, redirectTo, runtime.publicRegisterEnabled]);

  useEffect(() => {
    if (!oauthCode) return;
    if (!shouldHandleOAuthSearchFlag("oauth_code", oauthCode)) return;
    consumeLoginSearchFlag("oauth_code", oauthCode);
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
    if (!shouldHandleOAuthSearchFlag("oauth_error", oauthError)) return;
    consumeLoginSearchFlag("oauth_error", oauthError);
    notifyErrorText(resolveOAuthErrorMessage(oauthError, t));
    void navigate({
      to: "/login",
      search: { redirect: redirectTo, mode: effectiveMode },
      replace: true,
    });
  }, [effectiveMode, navigate, oauthError, redirectTo, t]);

  const onModeChange = (next: LoginMode, options?: LoginModeChangeOptions) => {
    const nextMode = resolveLoginMode(next, publicRegisterEnabled);

    setLoginSeed(
      nextMode === "login" && options?.email
        ? { email: options.email, step: options.step === "password" ? "password" : "email" }
        : null,
    );
    setLoginEmailCodeSeed(
      nextMode === "email-code" && options?.email
        ? {
            email: options.email,
            autoRequest: options.step === "verify",
            keepSession: options.keepSession ?? keepSession,
            passwordLoginAvailable: options.passwordLoginAvailable,
          }
        : null,
    );
    setRegisterSeed(
      nextMode === "register" && options?.email
        ? { email: options.email, step: options.step === "details" ? "details" : "email" }
        : null,
    );
    setForgotPasswordEmail(
      nextMode === "forgot-password" ? options?.email?.trim() || undefined : undefined,
    );

    void navigate({ to: "/login", search: { redirect: redirectTo, mode: nextMode } });
  };

  const onLoginEmailSubmit = async (email: string): Promise<LoginEmailLookupResult> => {
    const result = await emailCheckMutation.mutateAsync(email);
    return {
      exists: result.exists,
      passwordLoginAvailable: Boolean(
        result.passwordLoginAvailable ?? result.password_login_available,
      ),
    };
  };

  const onRegisterEmailSubmit = async (email: string) => {
    const result = await emailCheckMutation.mutateAsync(email);
    return result.exists;
  };

  const onBootstrapEmailSubmit = async (email: string) => {
    const result = await emailCheckMutation.mutateAsync(email);
    return result.exists;
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

  const onLoginEmailCodeRequest = async (email: string) =>
    loginEmailCodeRequestMutation.mutateAsync(email);

  const onLoginEmailCodeFinish = async (values: LoginEmailCodeFormValues) => {
    const keepSessionForEmailCode = loginEmailCodeSeed?.keepSession ?? keepSession;

    try {
      const tokens = await loginEmailCodeVerifyMutation.mutateAsync(values);
      clearChallenge();
      applyLogin(tokens, { keepSession: keepSessionForEmailCode });
      void queryClient.cancelQueries();
      queryClient.clear();
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth();
    } catch (error) {
      if (
        startTwoFactorChallenge(error, {
          keepSession: keepSessionForEmailCode,
          redirect: redirectTo,
          source: "email-code",
        })
      ) {
        return;
      }
      throw error;
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
    const nextMode = activeChallenge?.source === "email-code" ? "email-code" : "login";
    clearChallenge();
    void navigate({
      to: "/login",
      search: { ...(redirectTo ? { redirect: redirectTo } : {}), mode: nextMode },
      replace: true,
    });
  };

  const onForgotPassword = async (email: string) => {
    await forgotPasswordMutation.mutateAsync(email);
    notifyInfoText(t("auth:RESET_SENT"));
  };

  const onRegisterFinish = async (values: RegisterFormValues) => {
    if (!publicRegisterEnabled) return;
    try {
      await registerMutation.mutateAsync(values);
      const tokens = await loginMutation.mutateAsync({
        email: values.email,
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

  const onBootstrapFinish = async (values: BootstrapFormValues) => {
    const tokens = await bootstrapMutation.mutateAsync(values);
    clearChallenge();
    applyLogin(tokens, { keepSession: true });
    void queryClient.cancelQueries();
    queryClient.clear();
    notifySuccessText(t("auth:INSTANCE_BOOTSTRAP_SUCCESS"));
    await navigateAfterAuth();
  };

  const runtimeLoading = !runtimeReady;

  if (runtime.instanceSetupStatus === "uninitialized") {
    return {
      entry: "bootstrap",
      props: {
        onEmailSubmit: onBootstrapEmailSubmit,
        onSubmit: onBootstrapFinish,
        emailLoading: emailCheckMutation.isPending,
        loading: bootstrapMutation.isPending,
      },
    };
  }

  if (runtime.instanceSetupStatus === "repair_required") {
    return {
      entry: "repair_required",
      props: {
        repairReason: runtime.instanceSetupRepairReason,
        onRefresh: () => window.location.reload(),
      },
    };
  }

  return {
    entry: "auth",
    props: {
      mode: effectiveMode,
      onModeChange,
      onLoginEmailSubmit,
      onLoginSubmit: onLoginFinish,
      loginSeed,
      onLoginEmailCodeRequest,
      onLoginEmailCodeVerify: onLoginEmailCodeFinish,
      loginEmailCodeSeed,
      loginEmailLoading: emailCheckMutation.isPending,
      loginLoading: loginMutation.isPending || ssoExchangeMutation.isPending,
      loginEmailCodeRequestLoading: loginEmailCodeRequestMutation.isPending,
      loginEmailCodeVerifyLoading: loginEmailCodeVerifyMutation.isPending,
      initialKeepSession: keepSession,
      redirect: redirectTo,
      onForgotPasswordSubmit: onForgotPassword,
      forgotPasswordInitialEmail: forgotPasswordEmail,
      forgotPasswordLoading: forgotPasswordMutation.isPending,
      onRegisterEmailSubmit,
      onRegisterSubmit: onRegisterFinish,
      registerSeed,
      registerEmailLoading: emailCheckMutation.isPending,
      registerLoading: registerMutation.isPending || runtimeLoading,
      publicRegisterEnabled,
      challenge: activeChallenge,
      onLoginTwoFactorSubmit: onLoginTwoFactorFinish,
      onCancelTwoFactorChallenge,
      twoFactorLoading: loginTwoFactorMutation.isPending,
    },
  };
}
