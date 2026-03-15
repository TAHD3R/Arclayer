import { Lock, Mail, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { UseFormReturn } from "react-hook-form";

import { SetupFieldShell, SetupInputControl, SetupPasswordControl } from "./setup-form-controls";
import type { SetupAdminDraft } from "@/types/stores";

export function SetupAdminStep(props: {
  form: UseFormReturn<SetupAdminDraft>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { formState, register } = props.form;

  return (
    <div className="grid gap-4">
      <SetupFieldShell
        label={t("auth:FIELD_USERNAME_LABEL")}
        error={
          formState.errors.username?.message ? String(formState.errors.username.message) : undefined
        }
      >
        <SetupInputControl
          autoComplete="off"
          aria-label={t("auth:FIELD_USERNAME_LABEL")}
          placeholder={t("auth:FIELD_USERNAME_PLACEHOLDER")}
          startIcon={<User size={16} />}
          disabled={props.disabled}
          {...register("username")}
        />
      </SetupFieldShell>

      <SetupFieldShell
        label={t("auth:FIELD_PASSWORD_LABEL")}
        error={
          formState.errors.password?.message ? String(formState.errors.password.message) : undefined
        }
      >
        <SetupPasswordControl
          autoComplete="new-password"
          aria-label={t("auth:FIELD_PASSWORD_LABEL")}
          placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={props.disabled}
          {...register("password")}
        />
      </SetupFieldShell>

      <SetupFieldShell
        label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
        error={
          formState.errors.confirmPassword?.message
            ? String(formState.errors.confirmPassword.message)
            : undefined
        }
      >
        <SetupPasswordControl
          autoComplete="new-password"
          aria-label={t("auth:FIELD_CONFIRM_PASSWORD_LABEL")}
          placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
          startIcon={<Lock size={16} />}
          disabled={props.disabled}
          {...register("confirmPassword")}
        />
      </SetupFieldShell>

      <SetupFieldShell
        label={t("auth:FIELD_EMAIL_LABEL")}
        error={formState.errors.email?.message ? String(formState.errors.email.message) : undefined}
      >
        <SetupInputControl
          autoComplete="off"
          aria-label={t("auth:FIELD_EMAIL_LABEL")}
          placeholder={t("auth:FIELD_EMAIL_PLACEHOLDER")}
          startIcon={<Mail size={16} />}
          disabled={props.disabled}
          {...register("email")}
        />
      </SetupFieldShell>

      <SetupFieldShell
        label={t("setup:SETUP_FIELD_DISPLAY_NAME_LABEL")}
        error={
          formState.errors.displayName?.message
            ? String(formState.errors.displayName.message)
            : undefined
        }
      >
        <SetupInputControl
          autoComplete="off"
          aria-label={t("setup:SETUP_FIELD_DISPLAY_NAME_LABEL")}
          placeholder={t("setup:SETUP_FIELD_DISPLAY_NAME_PLACEHOLDER")}
          disabled={props.disabled}
          {...register("displayName")}
        />
      </SetupFieldShell>
    </div>
  );
}
