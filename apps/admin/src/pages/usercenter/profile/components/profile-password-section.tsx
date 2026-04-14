import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import * as authApi from "@/api/auth";
import { PasswordRequirementChecklist } from "@/components/auth/password-requirement-checklist";
import { PASSWORD_PATTERN } from "@/lib/auth/form-feedback";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { DialogField } from "./dialog-field";

export type UserPasswordSectionProps = {
  redirect: string;
};

type PasswordFormValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  code: string;
  backupCode: string;
};

const EMPTY_VALUES: PasswordFormValues = {
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
  code: "",
  backupCode: "",
};

function resolveReauthMethods(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const methods =
    (data as { setPasswordRequiredReauthMethods?: string[] }).setPasswordRequiredReauthMethods ??
    (data as { set_password_required_reauth_methods?: string[] })
      .set_password_required_reauth_methods;
  return Array.isArray(methods) ? methods : [];
}

function resolveHasPassword(data: unknown): boolean {
  if (!data || typeof data !== "object") return true;
  const camel = (data as { hasPassword?: boolean }).hasPassword;
  if (typeof camel === "boolean") return camel;
  const snake = (data as { has_password?: boolean }).has_password;
  if (typeof snake === "boolean") return snake;
  return true;
}

function buildPasswordSchema(
  t: (key: string) => string,
  options: { hasPassword: boolean; requiresTwoFactor: boolean },
) {
  return z
    .object({
      oldPassword: z.string(),
      newPassword: z
        .string()
        .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
        .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
      confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
      code: z.string(),
      backupCode: z.string(),
    })
    .superRefine((value, ctx) => {
      if (options.hasPassword && !value.oldPassword.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["oldPassword"],
          message: t("auth:VALIDATION_PASSWORD_REQUIRED"),
        });
      }
      if (value.confirmPassword !== value.newPassword) {
        ctx.addIssue({
          code: "custom",
          path: ["confirmPassword"],
          message: t("auth:VALIDATION_PASSWORD_MISMATCH"),
        });
      }
      if (!options.requiresTwoFactor) return;

      const code = value.code.trim();
      const backupCode = value.backupCode.trim();
      if (!code && !backupCode) {
        ctx.addIssue({
          code: "custom",
          path: ["code"],
          message: t("account:ME_PROFILE_PASSWORD_2FA_ONE_OF_REQUIRED"),
        });
        ctx.addIssue({
          code: "custom",
          path: ["backupCode"],
          message: t("account:ME_PROFILE_PASSWORD_2FA_ONE_OF_REQUIRED"),
        });
      }
      if (code && backupCode) {
        ctx.addIssue({
          code: "custom",
          path: ["code"],
          message: t("account:ME_PROFILE_PASSWORD_2FA_MUTUALLY_EXCLUSIVE"),
        });
        ctx.addIssue({
          code: "custom",
          path: ["backupCode"],
          message: t("account:ME_PROFILE_PASSWORD_2FA_MUTUALLY_EXCLUSIVE"),
        });
      }
    });
}

export function UserPasswordSection(props: UserPasswordSectionProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [open, setOpen] = useState(false);

  const capabilityQuery = useQuery({
    queryKey: ["auth", "security-capabilities", sessionVersion],
    queryFn: async () => authApi.getMySecurityCapabilities(),
    retry: false,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const hasPassword = resolveHasPassword(capabilityQuery.data);
  const setPasswordReauthMethods = resolveReauthMethods(capabilityQuery.data);
  const requiresSetPasswordTwoFactor = !hasPassword && setPasswordReauthMethods.includes("2fa");
  const requiresSetPasswordRelogin = !hasPassword && setPasswordReauthMethods.includes("relogin");

  const schema = useMemo(
    () =>
      buildPasswordSchema(t, {
        hasPassword,
        requiresTwoFactor: requiresSetPasswordTwoFactor,
      }),
    [hasPassword, requiresSetPasswordTwoFactor, t],
  );

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
    mode: "onTouched",
  });
  const oldPasswordFieldId = useId();
  const newPasswordFieldId = useId();
  const confirmPasswordFieldId = useId();
  const codeFieldId = useId();
  const backupCodeFieldId = useId();
  const newPasswordValue = form.watch("newPassword");

  const cardTitle = hasPassword
    ? t("account:ME_SECURITY_CHANGE_PASSWORD_TITLE")
    : t("account:ME_PROFILE_SET_PASSWORD_TITLE");
  const actionText = hasPassword
    ? t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION")
    : t("account:ME_PROFILE_SET_PASSWORD_ACTION");
  const dialogTitle = hasPassword
    ? t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_TITLE")
    : t("account:ME_PROFILE_SET_PASSWORD_DIALOG_TITLE");

  const dialogDescription = useMemo(() => {
    if (hasPassword) return t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_DESC");
    if (requiresSetPasswordTwoFactor) return t("account:ME_PROFILE_SET_PASSWORD_DIALOG_DESC_2FA");
    if (requiresSetPasswordRelogin) return t("account:ME_PROFILE_SET_PASSWORD_DIALOG_DESC_RELOGIN");
    return t("account:ME_PROFILE_SET_PASSWORD_DIALOG_DESC");
  }, [hasPassword, requiresSetPasswordRelogin, requiresSetPasswordTwoFactor, t]);

  const cardDescription = useMemo(() => {
    if (capabilityQuery.isError) return t("account:ME_PROFILE_PASSWORD_CAPABILITY_LOAD_FAILED");
    if (hasPassword) return t("account:ME_PROFILE_PASSWORD_DESC_CHANGE");
    if (requiresSetPasswordTwoFactor) return t("account:ME_PROFILE_PASSWORD_DESC_SET_2FA");
    if (requiresSetPasswordRelogin) return t("account:ME_PROFILE_PASSWORD_DESC_SET_RELOGIN");
    return t("account:ME_PROFILE_PASSWORD_DESC_SET");
  }, [
    capabilityQuery.isError,
    hasPassword,
    requiresSetPasswordRelogin,
    requiresSetPasswordTwoFactor,
    t,
  ]);

  useEffect(() => {
    if (!open) return;
    form.reset(EMPTY_VALUES);
  }, [form, open]);

  const changePasswordMutation = useMutation({
    mutationFn: async (values: PasswordFormValues) => {
      if (hasPassword) {
        return authApi.changePassword({
          old_password: values.oldPassword.trim(),
          new_password: values.newPassword,
        });
      }
      return authApi.setMyPassword({
        new_password: values.newPassword,
        ...(requiresSetPasswordTwoFactor && values.code.trim() ? { code: values.code.trim() } : {}),
        ...(requiresSetPasswordTwoFactor && values.backupCode.trim()
          ? { backup_code: values.backupCode.trim() }
          : {}),
      });
    },
    onSuccess: async () => {
      notifySuccessText(
        hasPassword
          ? t("account:ME_SECURITY_PASSWORD_CHANGED")
          : t("account:ME_PROFILE_SET_PASSWORD_SUCCESS"),
      );
      form.reset(EMPTY_VALUES);
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["auth", "security-capabilities"] });
    },
    onError: (err) => notifyError(err),
  });

  const canOpenDialog = !capabilityQuery.isLoading && !capabilityQuery.isError;
  const isBusy = changePasswordMutation.isPending;
  const saveDisabled = isBusy || requiresSetPasswordRelogin;

  return (
    <>
      <SettingCard>
        <SettingCardHeader
          title={cardTitle}
          description={cardDescription}
          action={
            <Button disabled={!canOpenDialog} onClick={() => setOpen(true)}>
              {actionText}
            </Button>
          }
        />
      </SettingCard>

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && isBusy) return;
          if (!next) form.reset(EMPTY_VALUES);
          setOpen(next);
        }}
        title={dialogTitle}
        description={dialogDescription}
        footer={
          <>
            <Button variant="ghost" disabled={isBusy} onClick={() => setOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            {requiresSetPasswordRelogin ? (
              <Button
                onClick={() => {
                  setOpen(false);
                  void navigate({
                    to: "/login",
                    search: { redirect: props.redirect },
                    replace: true,
                  });
                }}
              >
                {t("account:ME_PROFILE_SET_PASSWORD_RELOGIN_ACTION")}
              </Button>
            ) : null}
            <Button
              loading={changePasswordMutation.isPending}
              disabled={saveDisabled}
              onClick={() =>
                void form.handleSubmit((values) => changePasswordMutation.mutateAsync(values))()
              }
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <SettingDialogFields>
          {hasPassword ? (
            <DialogField
              label={t("account:ME_SECURITY_OLD_PASSWORD")}
              description={t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_DESC")}
              htmlFor={oldPasswordFieldId}
              error={form.formState.errors.oldPassword?.message}
            >
              <PasswordInput
                id={oldPasswordFieldId}
                {...form.register("oldPassword")}
                autoComplete="current-password"
              />
            </DialogField>
          ) : null}

          <DialogField
            label={t("account:ME_SECURITY_NEW_PASSWORD")}
            description={t("auth:PASSWORD_INVALID")}
            htmlFor={newPasswordFieldId}
            error={form.formState.errors.newPassword?.message}
          >
            <>
              <PasswordInput
                id={newPasswordFieldId}
                {...form.register("newPassword")}
                autoComplete="new-password"
              />
              <PasswordRequirementChecklist
                password={newPasswordValue}
                active={
                  Boolean(form.formState.dirtyFields.newPassword) || newPasswordValue.length > 0
                }
                t={t}
              />
            </>
          </DialogField>

          <DialogField
            label={t("account:ME_SECURITY_CONFIRM_PASSWORD")}
            description={t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")}
            htmlFor={confirmPasswordFieldId}
            error={form.formState.errors.confirmPassword?.message}
          >
            <PasswordInput
              id={confirmPasswordFieldId}
              {...form.register("confirmPassword")}
              autoComplete="new-password"
            />
          </DialogField>

          {requiresSetPasswordTwoFactor ? (
            <>
              <DialogField
                label={t("account:ME_PROFILE_PASSWORD_2FA_CODE")}
                description={t("account:ME_PROFILE_PASSWORD_2FA_CODE_PLACEHOLDER")}
                htmlFor={codeFieldId}
                error={form.formState.errors.code?.message}
              >
                <Input
                  id={codeFieldId}
                  {...form.register("code")}
                  placeholder={t("account:ME_PROFILE_PASSWORD_2FA_CODE_PLACEHOLDER")}
                />
              </DialogField>

              <DialogField
                label={t("account:ME_PROFILE_PASSWORD_2FA_BACKUP_CODE")}
                description={t("account:ME_PROFILE_PASSWORD_2FA_BACKUP_CODE_PLACEHOLDER")}
                htmlFor={backupCodeFieldId}
                error={form.formState.errors.backupCode?.message}
              >
                <Input
                  id={backupCodeFieldId}
                  {...form.register("backupCode")}
                  placeholder={t("account:ME_PROFILE_PASSWORD_2FA_BACKUP_CODE_PLACEHOLDER")}
                />
              </DialogField>
            </>
          ) : null}

          {requiresSetPasswordRelogin ? (
            <div className="text-callout text-label-secondary">
              {t("account:ME_PROFILE_SET_PASSWORD_RELOGIN_REQUIRED")}
            </div>
          ) : null}
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
