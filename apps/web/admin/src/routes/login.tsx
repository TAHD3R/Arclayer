import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useAuthStore } from "@/stores/auth.store";
import { type LoginFormValues, LoginView } from "@/views/LoginView";

function LoginPage() {
  const setAccessToken = useAuthStore((s) => s.setAccessToken);
  const navigate = useNavigate();
  const { redirect: redirectTo } = Route.useSearch();

  const onFinish = (values: LoginFormValues) => {
    // Placeholder: replace with real API call + token persistence.
    // Keep it simple so the base scaffold stays usable without backend wiring.
    setAccessToken(`${values.username}:dummy-token`);
    void navigate({ to: redirectTo || "/" });
  };

  return <LoginView onSubmit={onFinish} />;
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect =
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined;
    return redirect ? { redirect } : {};
  },
  component: LoginPage,
});
