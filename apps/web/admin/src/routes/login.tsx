import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useState } from "react";

import { authApi } from "@/api/auth";
import { useAuthStore } from "@/stores/auth.store";
import {
  type AuthMode,
  type LoginFormValues,
  type RegisterFormValues,
  LoginView,
} from "@/views/LoginView";
import {
  notifyError,
  notifyErrorText,
  notifyInfoText,
  notifySuccessText,
} from "@/core/services/notifications";
import { ApiError } from "@/lib/http";

type LoginSearch = {
  redirect?: string;
  mode?: AuthMode;
};

function LoginPage() {
  const applyLogin = useAuthStore((s) => s.applyLogin);
  const clear = useAuthStore((s) => s.clear);
  const keepSession = useAuthStore((s) => s.keepSession);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { redirect: redirectTo, mode = "login" } = Route.useSearch();
  const [checkingAuthz, setCheckingAuthz] = useState(false);

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

      // Post-login authorization check: user must have `admin:access` to enter the admin app.
      setCheckingAuthz(true);
      try {
        const snapshot = await authApi.meAuthz();
        const raw = snapshot as any;
        const isSuper = (raw.is_superuser ?? raw.isSuperuser ?? false) as boolean;
        const permissionCodes = (raw.permission_codes ?? raw.permissionCodes ?? []) as string[];
        const hasAdminAccess = isSuper || permissionCodes.includes("admin:access");
        if (!hasAdminAccess) {
          clear();
          notifyErrorText(t("auth:NO_ADMIN_ACCESS"));
          await navigate({ to: "/login", search: { mode: "login" }, replace: true });
          return;
        }
      } catch (err) {
        clear();
        if (err instanceof ApiError && err.status === 403) {
          notifyErrorText(t("auth:NO_ADMIN_ACCESS"));
        } else {
          notifyError(err);
        }
        await navigate({ to: "/login", search: { mode: "login" }, replace: true });
        return;
      } finally {
        setCheckingAuthz(false);
      }

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
      loginLoading={loginMutation.isPending || checkingAuthz}
      initialKeepSession={keepSession}
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
    };
  },
  component: LoginPage,
});
