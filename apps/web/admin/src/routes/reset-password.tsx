import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { notifySuccessText } from "@/utils/notifications";
import { ResetPasswordView } from "@/views/ResetPasswordView";

type ResetPasswordSearch = {
  token?: string;
};

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = Route.useSearch();

  const resetMutation = useMutation({
    mutationFn: async (values: { reset_token: string; new_password: string }) =>
      authApi.resetPassword(values),
  });

  return (
    <ResetPasswordView
      initialToken={token}
      loading={resetMutation.isPending}
      onSubmit={async (values) => {
        try {
          await resetMutation.mutateAsync(values);
          notifySuccessText(t("auth:RESET_SUCCESS"));
          void navigate({ to: "/login", search: { mode: "login" } });
        } catch {
          // Error toast is handled globally by TanStack Query's MutationCache onError.
        }
      }}
      onBackToLogin={() => {
        void navigate({ to: "/login", search: { mode: "login" } });
      }}
    />
  );
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => {
    const token = typeof search.token === "string" ? search.token : undefined;
    return token ? { token } : {};
  },
  component: ResetPasswordPage,
});
