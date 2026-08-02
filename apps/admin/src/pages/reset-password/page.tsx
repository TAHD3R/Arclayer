import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";

import * as authApi from "@/api/auth";
import { notifySuccessText } from "@/lib/notifications";
import { ResetPasswordView } from "./components/reset-password-view";

const resetPasswordRouteApi = getRouteApi("/reset-password/");

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { token } = resetPasswordRouteApi.useSearch();

  const resetMutation = useMutation({
    mutationFn: async (values: { resetToken: string; newPassword: string }) =>
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
