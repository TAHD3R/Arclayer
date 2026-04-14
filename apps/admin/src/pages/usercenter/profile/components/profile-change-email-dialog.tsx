import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import * as authApi from "@/api/auth";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { DialogField } from "./dialog-field";

export type UserChangeEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextEmail: string;
  redirect: string;
};

type ChangeEmailFormValues = {
  newEmail: string;
  code: string;
  password: string;
  twoFactorCode: string;
  backupCode: string;
};

const EMPTY_VALUES: ChangeEmailFormValues = {
  newEmail: "",
  code: "",
  password: "",
  twoFactorCode: "",
  backupCode: "",
};

function resolveEmailReauthMethods(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const camel = (data as { emailChangeRequiredReauthMethods?: string[] })
    .emailChangeRequiredReauthMethods;
  if (Array.isArray(camel)) return camel;
  const snake = (data as { email_change_required_reauth_methods?: string[] })
    .email_change_required_reauth_methods;
  return Array.isArray(snake) ? snake : [];
}

function buildSchema(
  t: (key: string) => string,
  options: { requiresPassword: boolean; requiresTwoFactor: boolean },
) {
  return z
    .object({
      newEmail: z
        .string()
        .min(1, t("account:ME_PROFILE_EMAIL_NEW_EMAIL_REQUIRED"))
        .email(t("account:ME_PROFILE_EMAIL_NEW_EMAIL_INVALID")),
      code: z.string().min(1, t("account:ME_PROFILE_EMAIL_CODE_REQUIRED")),
      password: z.string(),
      twoFactorCode: z.string(),
      backupCode: z.string(),
    })
    .superRefine((value, ctx) => {
      if (options.requiresPassword && !value.password.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: t("auth:VALIDATION_PASSWORD_REQUIRED"),
        });
      }

      if (!options.requiresTwoFactor) return;
      const code = value.twoFactorCode.trim();
      const backupCode = value.backupCode.trim();
      if (!code && !backupCode) {
        ctx.addIssue({
          code: "custom",
          path: ["twoFactorCode"],
          message: t("account:ME_PROFILE_EMAIL_2FA_ONE_OF_REQUIRED"),
        });
        ctx.addIssue({
          code: "custom",
          path: ["backupCode"],
          message: t("account:ME_PROFILE_EMAIL_2FA_ONE_OF_REQUIRED"),
        });
      }
      if (code && backupCode) {
        ctx.addIssue({
          code: "custom",
          path: ["twoFactorCode"],
          message: t("account:ME_PROFILE_EMAIL_2FA_MUTUALLY_EXCLUSIVE"),
        });
        ctx.addIssue({
          code: "custom",
          path: ["backupCode"],
          message: t("account:ME_PROFILE_EMAIL_2FA_MUTUALLY_EXCLUSIVE"),
        });
      }
    });
}

export function UserChangeEmailDialog(props: UserChangeEmailDialogProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);

  const normalizedEmail = useMemo(() => String(props.nextEmail || "").trim(), [props.nextEmail]);

  const capabilityQuery = useQuery({
    queryKey: ["auth", "security-capabilities", sessionVersion],
    queryFn: async () => authApi.getMySecurityCapabilities(),
    retry: false,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const reauthMethods = resolveEmailReauthMethods(capabilityQuery.data);
  const requiresPassword = reauthMethods.includes("password");
  const requiresTwoFactor = reauthMethods.includes("2fa");
  const requiresRelogin = reauthMethods.includes("relogin");

  const dialogDescription = useMemo(() => {
    if (requiresTwoFactor) return t("account:ME_PROFILE_EMAIL_DIALOG_DESC_2FA");
    if (requiresRelogin) return t("account:ME_PROFILE_EMAIL_DIALOG_DESC_RELOGIN");
    return t("account:ME_PROFILE_EMAIL_DIALOG_DESC");
  }, [requiresRelogin, requiresTwoFactor, t]);

  const schema = useMemo(
    () => buildSchema(t, { requiresPassword, requiresTwoFactor }),
    [requiresPassword, requiresTwoFactor, t],
  );

  const form = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_VALUES, newEmail: normalizedEmail },
    mode: "onTouched",
  });
  const newEmailFieldId = useId();
  const codeFieldId = useId();
  const passwordFieldId = useId();
  const twoFactorCodeFieldId = useId();
  const backupCodeFieldId = useId();

  useEffect(() => {
    if (!props.open) return;
    form.reset({ ...EMPTY_VALUES, newEmail: normalizedEmail });
  }, [form, normalizedEmail, props.open]);

  const requestCodeMutation = useMutation({
    mutationFn: async (payload: { newEmail: string }) => {
      return authApi.requestMyEmailChange({ new_email: payload.newEmail });
    },
    onSuccess: (out) => {
      notifySuccessText(
        t("account:ME_PROFILE_EMAIL_CODE_SENT", { seconds: String(out.expires_in ?? 0) }),
      );
    },
    onError: (err) => notifyError(err),
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: ChangeEmailFormValues) => {
      return authApi.confirmMyEmailChange({
        new_email: payload.newEmail,
        code: payload.code,
        ...(requiresPassword && payload.password.trim() ? { password: payload.password } : {}),
        ...(requiresTwoFactor && payload.twoFactorCode.trim()
          ? { two_factor_code: payload.twoFactorCode.trim() }
          : {}),
        ...(requiresTwoFactor && payload.backupCode.trim()
          ? { backup_code: payload.backupCode.trim() }
          : {}),
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      props.onOpenChange(false);
      form.reset(EMPTY_VALUES);
    },
    onError: (err) => notifyError(err),
  });

  const isBusy = requestCodeMutation.isPending || confirmMutation.isPending;

  function closeIfIdle(open: boolean) {
    if (!open && isBusy) return;
    if (!open) form.reset({ ...EMPTY_VALUES, newEmail: normalizedEmail });
    props.onOpenChange(open);
  }

  const saveDisabled =
    isBusy || capabilityQuery.isLoading || capabilityQuery.isError || requiresRelogin;

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={closeIfIdle}
      title={t("account:ME_PROFILE_EMAIL_DIALOG_TITLE")}
      description={dialogDescription}
      footer={
        <>
          <Button variant="ghost" disabled={isBusy} onClick={() => closeIfIdle(false)}>
            {t("auth:MODAL_CANCEL")}
          </Button>
          {requiresRelogin ? (
            <Button
              onClick={() => {
                closeIfIdle(false);
                void navigate({
                  to: "/login",
                  search: { redirect: props.redirect },
                  replace: true,
                });
              }}
            >
              {t("account:ME_PROFILE_EMAIL_RELOGIN_ACTION")}
            </Button>
          ) : null}
          <Button
            loading={confirmMutation.isPending}
            disabled={saveDisabled}
            onClick={() =>
              void form.handleSubmit((values) => confirmMutation.mutateAsync(values))()
            }
          >
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        <DialogField
          label={t("account:ME_PROFILE_EMAIL_NEW_EMAIL")}
          description={t("account:ME_PROFILE_EMAIL_NEW_EMAIL_PLACEHOLDER")}
          htmlFor={newEmailFieldId}
          error={form.formState.errors.newEmail?.message}
        >
          <Input
            id={newEmailFieldId}
            {...form.register("newEmail")}
            placeholder={t("account:ME_PROFILE_EMAIL_NEW_EMAIL_PLACEHOLDER")}
          />
        </DialogField>

        <DialogField
          label={t("account:ME_PROFILE_EMAIL_CODE")}
          description={t("account:ME_PROFILE_EMAIL_CODE_PLACEHOLDER")}
          htmlFor={codeFieldId}
          error={form.formState.errors.code?.message}
        >
          <div className="flex gap-2">
            <Input
              id={codeFieldId}
              {...form.register("code")}
              placeholder={t("account:ME_PROFILE_EMAIL_CODE_PLACEHOLDER")}
            />
            <Button
              variant="secondary"
              className="shrink-0"
              disabled={isBusy || capabilityQuery.isLoading || capabilityQuery.isError}
              loading={requestCodeMutation.isPending}
              onClick={() => {
                void (async () => {
                  const valid = await form.trigger("newEmail", { shouldFocus: true });
                  if (!valid) return;
                  await requestCodeMutation.mutateAsync({
                    newEmail: form.getValues("newEmail"),
                  });
                })();
              }}
            >
              {requestCodeMutation.isPending
                ? t("account:ME_PROFILE_EMAIL_SENDING_CODE")
                : t("account:ME_PROFILE_EMAIL_SEND_CODE")}
            </Button>
          </div>
        </DialogField>

        {requiresPassword ? (
          <>
            <DialogField
              label={t("account:ME_PROFILE_EMAIL_PASSWORD")}
              description={t("account:ME_PROFILE_EMAIL_PASSWORD_PLACEHOLDER")}
              htmlFor={passwordFieldId}
              error={form.formState.errors.password?.message}
            >
              <PasswordInput
                id={passwordFieldId}
                {...form.register("password")}
                placeholder={t("account:ME_PROFILE_EMAIL_PASSWORD_PLACEHOLDER")}
                autoComplete="current-password"
              />
            </DialogField>

            <div>
              <Button
                variant="link"
                className="h-auto p-0"
                disabled={isBusy}
                onClick={() => {
                  closeIfIdle(false);
                  void navigate({ to: "/reset-password" });
                }}
              >
                {t("account:ME_PROFILE_EMAIL_FORGOT_PASSWORD")}
              </Button>
            </div>
          </>
        ) : null}

        {requiresTwoFactor ? (
          <>
            <DialogField
              label={t("account:ME_PROFILE_EMAIL_2FA_CODE")}
              description={t("account:ME_PROFILE_EMAIL_2FA_CODE_PLACEHOLDER")}
              htmlFor={twoFactorCodeFieldId}
              error={form.formState.errors.twoFactorCode?.message}
            >
              <Input
                id={twoFactorCodeFieldId}
                {...form.register("twoFactorCode")}
                placeholder={t("account:ME_PROFILE_EMAIL_2FA_CODE_PLACEHOLDER")}
              />
            </DialogField>

            <DialogField
              label={t("account:ME_PROFILE_EMAIL_2FA_BACKUP_CODE")}
              description={t("account:ME_PROFILE_EMAIL_2FA_BACKUP_CODE_PLACEHOLDER")}
              htmlFor={backupCodeFieldId}
              error={form.formState.errors.backupCode?.message}
            >
              <Input
                id={backupCodeFieldId}
                {...form.register("backupCode")}
                placeholder={t("account:ME_PROFILE_EMAIL_2FA_BACKUP_CODE_PLACEHOLDER")}
              />
            </DialogField>
          </>
        ) : null}

        {requiresRelogin ? (
          <div className="text-callout text-label-secondary">
            {t("account:ME_PROFILE_EMAIL_RELOGIN_REQUIRED")}
          </div>
        ) : null}

        {capabilityQuery.isError ? (
          <div className="text-callout text-destructive">
            {t("account:ME_PROFILE_PASSWORD_CAPABILITY_LOAD_FAILED")}
          </div>
        ) : null}
      </SettingDialogFields>
    </SettingDialog>
  );
}
