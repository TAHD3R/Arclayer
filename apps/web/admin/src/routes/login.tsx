import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";

import * as authApi from "@/api/auth";
import * as authSsoApi from "@/api/auth-sso";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  type AuthMode,
  type LoginFormValues,
  type RegisterFormValues,
  LoginView,
} from "@/pages/login/page";
import { notifyErrorText, notifyInfoText, notifySuccessText } from "@/lib/notifications";

type LoginSearch = {
  redirect?: string;
  mode?: AuthMode;
  oauth_code?: string;
  oauth_error?: string;
};

function LoginPage() {
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const keepSession = useAuthStore((s) => s.keepSession);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { redirect: redirectTo, mode = "login", oauth_code: oauthCode, oauth_error: oauthError } =
    Route.useSearch();

  useEffect(() => {
    // Clean up legacy/accidental recursive `redirect=/login?...` parameters to avoid URL bloat.
    const params = new URLSearchParams(window.location.search);
    const rawRedirect = params.get("redirect");
    if (!rawRedirect) return;

    // If `validateSearch` dropped the redirect, it means it's unsafe; remove it from the URL.
    if (!redirectTo) {
      void navigate({ to: "/login", search: { mode }, replace: true });
    }
  }, [mode, navigate, redirectTo]);

  const loginMutation = useMutation({
    mutationFn: async (values: LoginFormValues) =>
      authApi.login({ identifier: values.account, password: values.password }),
  });

  const ssoExchangeMutation = useMutation({
    mutationFn: async (code: string) => authSsoApi.exchangeSSOCode(code),
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    if (!oauthCode) return;

    const run = async () => {
      try {
        const tokens = await ssoExchangeMutation.mutateAsync(oauthCode);
        // SSO login is always a short-lived action; respect the user's existing keepSession preference.
        applyLogin(tokens, { keepSession });
        await navigate({ to: redirectTo || "/", replace: true });
      } catch {
        // Error toast is handled globally by TanStack Query's MutationCache onError.
        void navigate({ to: "/login", search: { redirect: redirectTo, mode }, replace: true });
      }
    };

    void run();
  }, [applyLogin, keepSession, mode, navigate, oauthCode, redirectTo, ssoExchangeMutation]);

  useEffect(() => {
    if (!oauthError) return;

    const msg = (() => {
      if (oauthError === "email_not_verified") return t("auth:OAUTH_ERROR_EMAIL_NOT_VERIFIED");
      if (oauthError === "provisioning_disabled") return t("auth:OAUTH_ERROR_PROVISIONING_DISABLED");
      return t("auth:OAUTH_ERROR_GENERIC");
    })();

    notifyErrorText(msg);
    void navigate({ to: "/login", search: { redirect: redirectTo, mode }, replace: true });
  }, [mode, navigate, oauthError, redirectTo, t]);

  const forgotPasswordMutation = useMutation({
    mutationFn: async (identifier: string) => authApi.forgotPassword({ identifier }),
  });

  const onModeChange = (next: AuthMode) => {
    void navigate({
      to: "/login",
      search: { redirect: redirectTo, mode: next },
    });
  };

  const onLoginFinish = async (values: LoginFormValues) => {
    try {
      const tokens = await loginMutation.mutateAsync(values);
      applyLogin(tokens, { keepSession: values.keepSession });

      notifySuccessText(t("auth:LOGIN_SUCCESS"));
      await navigate({ to: redirectTo || "/", replace: true });
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

  const onRegisterFinish = (_values: RegisterFormValues) => {
    // Static UI for now; backend wiring will come next.
    // Keep the user in the auth flow without pretending the register call succeeded.
    notifyInfoText(t("auth:REGISTER_COMING_SOON"));
  };

  return (
    <LoginView
      mode={mode}
      onModeChange={onModeChange}
      onLoginSubmit={onLoginFinish}
      loginLoading={loginMutation.isPending}
      initialKeepSession={keepSession}
      redirect={redirectTo}
      onForgotPassword={onForgotPassword}
      onRegisterSubmit={onRegisterFinish}
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
