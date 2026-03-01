import { useMutation } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import * as authSsoApi from "@/api/auth-sso";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolveLoginMode } from "@/lib/auth/auth-mode";
import type { LoginMode } from "@/lib/auth/auth-mode";
import { resolvePostAuthRoute } from "@/lib/routing/bootstrap-routing";
import { consumeStudioReturnTo, resolveStudioOrigin } from "@/lib/routing/studio-return";
import { notifyErrorText, notifyInfoText, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import type { LoginFormValues, RegisterFormValues } from "../types";

const loginRouteApi = getRouteApi("/login/");

function normalizeEditorRedirectPath(redirectTo: string): string {
  if (redirectTo === "/editor") return "/editor/";
  if (redirectTo.startsWith("/editor?")) return `/editor/${redirectTo.slice("/editor".length)}`;
  if (redirectTo.startsWith("/editor#")) return `/editor/${redirectTo.slice("/editor".length)}`;
  return redirectTo;
}

export function useLoginPage() {
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const keepSession = useAuthStore((s) => s.keepSession);
  const lastWorkspaceId = useWorkspaceStore((s) => s.lastWorkspaceId);
  const setCurrentWorkspaceId = useWorkspaceStore((s) => s.setCurrentWorkspaceId);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const runtime = useSystemRuntime();

  const {
    redirect: redirectTo,
    mode = "login",
    oauth_code: oauthCode,
    oauth_error: oauthError,
  } = loginRouteApi.useSearch();

  const publicRegisterEnabled = runtime.publicRegisterEnabled;
  const effectiveMode = resolveLoginMode(mode, publicRegisterEnabled);

  // --- Mutations ---

  const loginMutation = useMutation({
    mutationFn: async (values: LoginFormValues) =>
      authApi.login({ identifier: values.account, password: values.password }),
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

  // --- Navigation helpers ---

  const navigateAfterAuth = useCallback(async () => {
    if (redirectTo) {
      if (redirectTo.startsWith("/editor")) {
        window.location.replace(normalizeEditorRedirectPath(redirectTo));
        return;
      }
      await navigate({ to: redirectTo, replace: true });
      return;
    }

    const studioReturnTo = consumeStudioReturnTo();
    if (studioReturnTo) {
      const studioOrigin = resolveStudioOrigin();
      // Ensure refresh cookie exists for cross-subdomain Studio auth.
      const refreshToken = useAuthStore.getState().refreshToken;
      try {
        if (refreshToken) {
          const tokens = await authApi.refresh({ refresh_token: refreshToken });
          useAuthStore.getState().setTokens(tokens);
        }
        await authApi.refreshCookie();
      } catch {
        notifyErrorText(t("auth:STUDIO_SESSION_REQUIRED"));
        await navigate({ to: "/", replace: true });
        return;
      }
      window.location.replace(`${studioOrigin}${studioReturnTo}`);
      return;
    }

    const decision = await resolvePostAuthRoute({ lastWorkspaceId, attemptRepair: true });
    if (decision.workspaceId) {
      setCurrentWorkspaceId(decision.workspaceId);
    }
    await navigate({ to: decision.path, replace: true });
  }, [lastWorkspaceId, navigate, redirectTo, setCurrentWorkspaceId]);

  // --- Effects ---

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawRedirect = params.get("redirect");
    if (!rawRedirect) return;
    if (!redirectTo) {
      void navigate({ to: "/login", search: { mode: effectiveMode }, replace: true });
    }
  }, [effectiveMode, navigate, redirectTo]);

  useEffect(() => {
    if (mode !== "register" || publicRegisterEnabled) return;
    void navigate({
      to: "/login",
      search: { ...(redirectTo ? { redirect: redirectTo } : {}), mode: "login" },
      replace: true,
    });
  }, [mode, navigate, publicRegisterEnabled, redirectTo]);

  useEffect(() => {
    if (!oauthCode) return;
    const run = async () => {
      try {
        const tokens = await ssoExchangeMutation.mutateAsync(oauthCode);
        applyLogin(tokens, { keepSession });
        await navigateAfterAuth();
      } catch {
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
    keepSession,
    effectiveMode,
    navigate,
    oauthCode,
    redirectTo,
    navigateAfterAuth,
    ssoExchangeMutation,
  ]);

  useEffect(() => {
    if (!oauthError) return;
    const msg = (() => {
      if (oauthError === "email_not_verified") return t("auth:OAUTH_ERROR_EMAIL_NOT_VERIFIED");
      if (oauthError === "provisioning_disabled")
        return t("auth:OAUTH_ERROR_PROVISIONING_DISABLED");
      return t("auth:OAUTH_ERROR_GENERIC");
    })();
    notifyErrorText(msg);
    void navigate({
      to: "/login",
      search: { redirect: redirectTo, mode: effectiveMode },
      replace: true,
    });
  }, [effectiveMode, navigate, oauthError, redirectTo, t]);

  // --- Handlers ---

  const onModeChange = (next: LoginMode) => {
    const nextMode = resolveLoginMode(next, publicRegisterEnabled);
    void navigate({ to: "/login", search: { redirect: redirectTo, mode: nextMode } });
  };

  const onLoginFinish = async (values: LoginFormValues) => {
    try {
      const tokens = await loginMutation.mutateAsync(values);
      applyLogin(tokens, { keepSession: values.keepSession });
      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth();
    } catch {
      // Error toast handled globally by MutationCache onError.
    }
  };

  const onForgotPassword = async (identifier: string) => {
    try {
      const payload = await forgotPasswordMutation.mutateAsync(identifier);
      notifyInfoText(t("auth:RESET_SENT"));
      if (payload?.reset_token) {
        void navigate({ to: "/reset-password", search: { token: payload.reset_token } });
      }
    } catch {
      // Error toast handled globally by MutationCache onError.
    }
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
      applyLogin(tokens, { keepSession: true });
      notifySuccessText(t("auth:REGISTER_SUCCESS"));
      await navigateAfterAuth();
    } catch {
      // Error toast handled globally by MutationCache onError.
    }
  };

  return {
    mode: effectiveMode,
    onModeChange,
    onLoginSubmit: onLoginFinish,
    loginLoading: loginMutation.isPending || ssoExchangeMutation.isPending,
    initialKeepSession: keepSession,
    redirect: redirectTo,
    onForgotPassword,
    onRegisterSubmit: onRegisterFinish,
    registerLoading: registerMutation.isPending,
    publicRegisterEnabled,
  };
}
