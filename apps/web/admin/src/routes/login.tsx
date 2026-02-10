import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect } from "react";

import * as authApi from "@/api/auth";
import * as authSsoApi from "@/api/auth-sso";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { resolveLoginMode } from "@/lib/auth-mode";
import { resolvePostAuthRoute } from "@/lib/bootstrap-routing";
import { notifyErrorText, notifyInfoText, notifySuccessText } from "@/lib/notifications";
import {
  type AuthMode,
  type LoginFormValues,
  LoginView,
  type RegisterFormValues,
} from "@/pages/login/page";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

type LoginSearch = {
  redirect?: string;
  mode?: AuthMode;
  oauth_code?: string;
  oauth_error?: string;
};

function LoginPage() {
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
  } = Route.useSearch();
  const publicRegisterEnabled = runtime.publicRegisterEnabled;
  const effectiveMode = resolveLoginMode(mode, publicRegisterEnabled);

  useEffect(() => {
    // Clean up legacy/accidental recursive `redirect=/login?...` parameters to avoid URL bloat.
    const params = new URLSearchParams(window.location.search);
    const rawRedirect = params.get("redirect");
    if (!rawRedirect) return;

    // If `validateSearch` dropped the redirect, it means it's unsafe; remove it from the URL.
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

  const navigateAfterAuth = useCallback(async () => {
    if (redirectTo) {
      await navigate({ to: redirectTo, replace: true });
      return;
    }

    const decision = await resolvePostAuthRoute({ lastWorkspaceId, attemptRepair: true });
    if (decision.workspaceId) {
      setCurrentWorkspaceId(decision.workspaceId);
    }
    await navigate({ to: decision.path, replace: true });
  }, [lastWorkspaceId, navigate, redirectTo, setCurrentWorkspaceId]);

  useEffect(() => {
    if (!oauthCode) return;

    const run = async () => {
      try {
        const tokens = await ssoExchangeMutation.mutateAsync(oauthCode);
        // SSO login is always a short-lived action; respect the user's existing keepSession preference.
        applyLogin(tokens, { keepSession });
        await navigateAfterAuth();
      } catch {
        // Error toast is handled globally by TanStack Query's MutationCache onError.
        void navigate({ to: "/login", search: { redirect: redirectTo, mode: effectiveMode }, replace: true });
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
    void navigate({ to: "/login", search: { redirect: redirectTo, mode: effectiveMode }, replace: true });
  }, [effectiveMode, navigate, oauthError, redirectTo, t]);

  const forgotPasswordMutation = useMutation({
    mutationFn: async (identifier: string) => authApi.forgotPassword({ identifier }),
  });

  const onModeChange = (next: AuthMode) => {
    const nextMode = resolveLoginMode(next, publicRegisterEnabled);
    void navigate({
      to: "/login",
      search: { redirect: redirectTo, mode: nextMode },
    });
  };

  const onLoginFinish = async (values: LoginFormValues) => {
    try {
      const tokens = await loginMutation.mutateAsync(values);
      applyLogin(tokens, { keepSession: values.keepSession });

      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigateAfterAuth();
    } catch {
      // Error toast is handled globally by TanStack Query's MutationCache onError.
    }
  };

  const onForgotPassword = async (identifier: string) => {
    try {
      const payload = await forgotPasswordMutation.mutateAsync(identifier);
      notifyInfoText(t("auth:RESET_SENT"));
      if (payload?.reset_token) {
        // Dev/Test convenience: backend returns token payload only in non-prod env.
        void navigate({ to: "/reset-password", search: { token: payload.reset_token } });
      }
    } catch {
      // Error toast is handled globally by TanStack Query's MutationCache onError.
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
      // Error toast is handled globally by TanStack Query's MutationCache onError.
    }
  };

  return (
    <LoginView
      mode={effectiveMode}
      onModeChange={onModeChange}
      onLoginSubmit={onLoginFinish}
      loginLoading={loginMutation.isPending || ssoExchangeMutation.isPending}
      initialKeepSession={keepSession}
      redirect={redirectTo}
      onForgotPassword={onForgotPassword}
      onRegisterSubmit={onRegisterFinish}
      registerLoading={registerMutation.isPending}
      publicRegisterEnabled={publicRegisterEnabled}
    />
  );
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const redirect =
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined;

    const mode = search.mode === "register" ? "register" : "login";

    const oauth_code = typeof search.oauth_code === "string" ? search.oauth_code : undefined;
    const oauth_error = typeof search.oauth_error === "string" ? search.oauth_error : undefined;

    // Never allow redirect to point back to auth pages (prevents recursive /login?redirect=/login?... loops).
    const safeRedirect = (() => {
      if (!redirect) return undefined;
      const pathname = redirect.split("?")[0] || "";
      if (pathname === "/login" || pathname === "/reset-password") return undefined;
      return redirect;
    })();

    return {
      ...(safeRedirect ? { redirect: safeRedirect } : {}),
      mode,
      ...(oauth_code ? { oauth_code } : {}),
      ...(oauth_error ? { oauth_error } : {}),
    };
  },
  component: LoginPage,
});
