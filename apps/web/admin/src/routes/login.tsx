import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { useAuthStore } from "@/stores/auth.store";
import { type AuthMode, type LoginFormValues, type RegisterFormValues, LoginView } from "@/views/LoginView";
import { notifyInfoText } from "@/core/services/notifications";

type LoginSearch = {
  redirect?: string;
  mode?: AuthMode;
};

function LoginPage() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { redirect: redirectTo, mode = "login" } = Route.useSearch();

  const onModeChange = (next: AuthMode) => {
    void navigate({
      to: "/login",
      search: { redirect: redirectTo, mode: next },
    });
  };

  const onLoginFinish = (values: LoginFormValues) => {
    // Placeholder: replace with real API call + token persistence.
    // Keep it simple so the base scaffold stays usable without backend wiring.
    setAccessToken(`${values.account}:dummy-token`);
    void navigate({ to: redirectTo || "/" });
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

    return {
      ...(redirect ? { redirect } : {}),
      mode,
    };
  },
  component: LoginPage,
});
