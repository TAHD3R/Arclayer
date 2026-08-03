import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import * as authApi from "@/api/auth";
import { PasswordRequirementChecklist } from "@/components/auth/password-requirement-checklist";
import { PASSWORD_PATTERN } from "@/lib/auth/form-feedback";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { ApiError } from "@/lib/http";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { AuthOtpInput } from "@/pages/login/components/auth-pane-primitives";
import { useSecurityActionVerification } from "@/pages/usercenter/shared/security-action-verification";
import { useSecurityRelogin } from "@/pages/usercenter/shared/use-security-relogin";
import { useAuthStore } from "@/stores/use-auth-store";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Button } from "@arclayer/ui/button";
import { PasswordInput } from "@arclayer/ui/password-input";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { DialogField } from "./dialog-field";
import { resolveHasPassword, resolveSetPasswordReauthMethods } from "./security-capabilities";

export type UserPasswordSectionProps = {
  redirect: string;
};

type PasswordDialogMode = "change" | "remove";
type RemovePasswordStep = "request" | "verify";

type PasswordFormValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  code: string;
};

const OTP_LENGTH = 6;
const EMPTY_VALUES: PasswordFormValues = {
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
  code: "",
};

function normalizeRequestResult(result: { expiresIn: number; retryAfter: number }) {
  return {
    expiresIn: result.expiresIn,
    retryAfter: result.retryAfter,
  };
}

function buildPasswordSchema(t: (key: string) => string, options: { hasPassword: boolean }) {
  return z
    .object({
      oldPassword: z.string(),
      newPassword: z
        .string()
        .min(1, t("auth:VALIDATION_PASSWORD_REQUIRED"))
        .regex(PASSWORD_PATTERN, t("auth:PASSWORD_INVALID")),
      confirmPassword: z.string().min(1, t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED")),
      code: z.string(),
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
    });
}

export function UserPasswordSection(props: UserPasswordSectionProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const navigate = useNavigate();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const forceRelogin = useSecurityRelogin(props.redirect);
  const securityVerification = useSecurityActionVerification();
  const [open, setOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<PasswordDialogMode>("change");
  const [removePasswordStep, setRemovePasswordStep] = useState<RemovePasswordStep>("request");
  const [removePasswordRequestError, setRemovePasswordRequestError] = useState<string | null>(null);
  const [removePasswordVerifyError, setRemovePasswordVerifyError] = useState<string | null>(null);
  const [removePasswordRetryAfter, setRemovePasswordRetryAfter] = useState(0);

  const capabilityQuery = useQuery({
    queryKey: ["auth", "security-capabilities", sessionVersion],
    queryFn: async () => authApi.getMySecurityCapabilities(),
    retry: false,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const hasPassword = resolveHasPassword(capabilityQuery.data);
  const setPasswordReauthMethods = resolveSetPasswordReauthMethods(capabilityQuery.data);
  const requiresSetPasswordTwoFactor = !hasPassword && setPasswordReauthMethods.includes("2fa");
  const requiresSetPasswordRelogin = !hasPassword && setPasswordReauthMethods.includes("relogin");

  const schema = useMemo(
    () =>
      buildPasswordSchema(t, {
        hasPassword,
      }),
    [hasPassword, t],
  );

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
    mode: "onTouched",
  });
  const oldPasswordFieldId = useId();
  const newPasswordFieldId = useId();
  const confirmPasswordFieldId = useId();
  const newPasswordValue = form.watch("newPassword");

  const cardTitle = hasPassword
    ? t("account:ME_SECURITY_CHANGE_PASSWORD_TITLE")
    : t("account:ME_PROFILE_SET_PASSWORD_TITLE");
  const actionText = hasPassword
    ? t("account:ME_SECURITY_CHANGE_PASSWORD_ACTION")
    : t("account:ME_PROFILE_SET_PASSWORD_ACTION");

  const dialogTitle = useMemo(() => {
    if (hasPassword && dialogMode === "remove") {
      return t("account:ME_PROFILE_REMOVE_PASSWORD_DIALOG_TITLE");
    }
    return hasPassword
      ? t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_TITLE")
      : t("account:ME_PROFILE_SET_PASSWORD_DIALOG_TITLE");
  }, [dialogMode, hasPassword, t]);

  const dialogDescription = useMemo(() => {
    if (hasPassword && dialogMode === "remove") {
      return removePasswordStep === "verify"
        ? t("account:ME_PROFILE_REMOVE_PASSWORD_VERIFY_DESC")
        : t("account:ME_PROFILE_REMOVE_PASSWORD_DIALOG_DESC");
    }
    if (hasPassword) return t("account:ME_SECURITY_CHANGE_PASSWORD_DIALOG_DESC");
    if (requiresSetPasswordTwoFactor) return t("account:ME_PROFILE_SET_PASSWORD_DIALOG_DESC_2FA");
    if (requiresSetPasswordRelogin) return t("account:ME_PROFILE_SET_PASSWORD_DIALOG_DESC_RELOGIN");
    return t("account:ME_PROFILE_SET_PASSWORD_DIALOG_DESC");
  }, [
    dialogMode,
    hasPassword,
    removePasswordStep,
    requiresSetPasswordRelogin,
    requiresSetPasswordTwoFactor,
    t,
  ]);

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
    setDialogMode("change");
    setRemovePasswordStep("request");
    setRemovePasswordRequestError(null);
    setRemovePasswordVerifyError(null);
    setRemovePasswordRetryAfter(0);
  }, [form, open]);

  useEffect(() => {
    if (removePasswordRetryAfter <= 0) return;
    const timer = window.setInterval(() => {
      setRemovePasswordRetryAfter((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [removePasswordRetryAfter]);

  const changePasswordMutation = useMutation({
    mutationFn: async (payload: { values: PasswordFormValues; mfaProof?: string }) => {
      const values = payload.values;
      if (hasPassword) {
        return authApi.changePassword({
          oldPassword: values.oldPassword.trim(),
          newPassword: values.newPassword,
          mfaProof: payload.mfaProof,
        });
      }
      return authApi.setMyPassword({
        newPassword: values.newPassword,
        mfaProof: payload.mfaProof,
      });
    },
    onSuccess: async () => {
      notifySuccessText(
        hasPassword
          ? t("account:ME_SECURITY_PASSWORD_CHANGED")
          : t("account:ME_PROFILE_SET_PASSWORD_SUCCESS"),
      );
      await forceRelogin();
    },
    onError: (err) => notifyError(err),
  });

  const requestRemovePasswordMutation = useMutation({
    mutationFn: async (currentPassword: string) => {
      return authApi.requestRemoveMyPassword({ currentPassword });
    },
    onSuccess: (result) => {
      const normalized = normalizeRequestResult(result);
      setRemovePasswordRequestError(null);
      setRemovePasswordVerifyError(null);
      setRemovePasswordStep("verify");
      setRemovePasswordRetryAfter(normalized.retryAfter);
      form.setValue("code", "");
      form.clearErrors("code");
      notifySuccessText(t("auth:LOGIN_CODE_SENT"));
    },
  });

  const confirmRemovePasswordMutation = useMutation({
    mutationFn: async (payload: { code: string; mfaProof?: string }) =>
      authApi.confirmRemoveMyPassword(payload),
    onSuccess: async () => {
      notifySuccessText(t("account:ME_PROFILE_REMOVE_PASSWORD_SUCCESS"));
      await forceRelogin();
    },
    onError: (err) => notifyError(err),
  });

  const canOpenDialog = !capabilityQuery.isLoading && !capabilityQuery.isError;
  const isChangingPassword = changePasswordMutation.isPending;
  const isRemovingPassword =
    requestRemovePasswordMutation.isPending || confirmRemovePasswordMutation.isPending;
  const saveDisabled = isChangingPassword || requiresSetPasswordRelogin;

  async function requestRemovePasswordCode() {
    setRemovePasswordRequestError(null);
    const isValid = await form.trigger("oldPassword");
    if (!isValid) return;
    try {
      await requestRemovePasswordMutation.mutateAsync(form.getValues("oldPassword").trim());
    } catch (error) {
      setRemovePasswordStep("request");
      setRemovePasswordRequestError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_REQUEST_FAILED"),
      );
    }
  }

  async function confirmRemovePassword() {
    const code = form.getValues("code").trim();
    if (code.length < OTP_LENGTH) {
      form.setError("code", {
        type: "manual",
        message: t("account:ME_PROFILE_REMOVE_PASSWORD_CODE_REQUIRED"),
      });
      return;
    }
    try {
      setRemovePasswordVerifyError(null);
      const verification = await securityVerification.requestProof("confirm_remove_password");
      if (verification.cancelled) return;
      await confirmRemovePasswordMutation.mutateAsync({ code, mfaProof: verification.proof });
    } catch (error) {
      setRemovePasswordVerifyError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_INVALID"),
      );
    }
  }

  const footer = useMemo(() => {
    if (hasPassword && dialogMode === "remove") {
      return (
        <>
          <Button
            variant="ghost"
            disabled={isRemovingPassword}
            onClick={() => {
              setDialogMode("change");
              setRemovePasswordStep("request");
              setRemovePasswordRequestError(null);
              setRemovePasswordVerifyError(null);
              setRemovePasswordRetryAfter(0);
              form.clearErrors("code");
            }}
          >
            {t("account:ME_PROFILE_REMOVE_PASSWORD_BACK")}
          </Button>
          <Button
            variant="primary"
            loading={
              removePasswordStep === "request"
                ? requestRemovePasswordMutation.isPending
                : confirmRemovePasswordMutation.isPending
            }
            disabled={isRemovingPassword}
            onClick={() => {
              if (removePasswordStep === "request") {
                void requestRemovePasswordCode();
                return;
              }
              void confirmRemovePassword();
            }}
          >
            {removePasswordStep === "request"
              ? t("account:ME_PROFILE_REMOVE_PASSWORD_SEND_CODE")
              : t("account:ME_PROFILE_REMOVE_PASSWORD_CONFIRM")}
          </Button>
        </>
      );
    }

    return (
      <>
        {hasPassword ? (
          <Button
            variant="ghost"
            disabled={isChangingPassword}
            onClick={() => {
              setDialogMode("remove");
              setRemovePasswordStep("request");
              setRemovePasswordRequestError(null);
              setRemovePasswordVerifyError(null);
              setRemovePasswordRetryAfter(0);
            }}
          >
            {t("account:ME_PROFILE_REMOVE_PASSWORD_ACTION")}
          </Button>
        ) : (
          <Button variant="ghost" disabled={isChangingPassword} onClick={() => setOpen(false)}>
            {t("common:CANCEL")}
          </Button>
        )}
        {requiresSetPasswordRelogin ? (
          <Button
            variant="primary"
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
          variant="primary"
          loading={changePasswordMutation.isPending}
          disabled={saveDisabled}
          onClick={() =>
            void form.handleSubmit(async (values) => {
              const verification = await securityVerification.requestProof(
                hasPassword ? "change_password" : "set_password",
              );
              if (verification.cancelled) return;
              await changePasswordMutation.mutateAsync({
                values,
                mfaProof: verification.proof,
              });
            })()
          }
        >
          {t("settings:SETTINGS_SAVE")}
        </Button>
      </>
    );
  }, [
    changePasswordMutation.isPending,
    confirmRemovePasswordMutation.isPending,
    dialogMode,
    form,
    hasPassword,
    isChangingPassword,
    isRemovingPassword,
    navigate,
    props.redirect,
    removePasswordStep,
    requestRemovePasswordMutation.isPending,
    requiresSetPasswordRelogin,
    saveDisabled,
    t,
  ]);

  return (
    <>
      <SettingCard>
        <SettingCardHeader
          title={cardTitle}
          description={cardDescription}
          action={
            <Button variant="outline" disabled={!canOpenDialog} onClick={() => setOpen(true)}>
              {actionText}
            </Button>
          }
        />
      </SettingCard>

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && (isChangingPassword || isRemovingPassword)) return;
          if (!next) form.reset(EMPTY_VALUES);
          setOpen(next);
        }}
        title={dialogTitle}
        description={dialogDescription}
        footer={footer}
      >
        <SettingDialogFields>
          {hasPassword && dialogMode === "remove" ? (
            removePasswordStep === "request" ? (
              <>
                <DialogField
                  label={t("account:ME_SECURITY_OLD_PASSWORD")}
                  htmlFor={oldPasswordFieldId}
                  error={form.formState.errors.oldPassword?.message}
                >
                  <PasswordInput
                    id={oldPasswordFieldId}
                    {...form.register("oldPassword")}
                    autoComplete="current-password"
                    placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                  />
                </DialogField>
                {removePasswordRequestError ? (
                  <p className="text-callout text-danger">{removePasswordRequestError}</p>
                ) : null}
              </>
            ) : (
              <DialogField
                label={t("account:ME_PROFILE_REMOVE_PASSWORD_CODE")}
                description={t("account:ME_PROFILE_REMOVE_PASSWORD_CODE_DESC")}
                error={
                  form.formState.errors.code?.message ?? removePasswordVerifyError ?? undefined
                }
              >
                <div className="grid gap-3">
                  <p className="text-callout text-label-secondary">
                    {t("account:ME_PROFILE_REMOVE_PASSWORD_CODE_SENT_HINT")}
                  </p>
                  <AuthOtpInput
                    value={form.watch("code")}
                    onChange={(value) => {
                      form.setValue("code", value, { shouldValidate: false });
                      if (form.formState.errors.code) form.clearErrors("code");
                      if (removePasswordVerifyError) setRemovePasswordVerifyError(null);
                    }}
                    aria-label={t("account:ME_PROFILE_REMOVE_PASSWORD_CODE")}
                    invalid={Boolean(removePasswordVerifyError)}
                    disabled={confirmRemovePasswordMutation.isPending}
                    maxLength={OTP_LENGTH}
                  />
                  <div className="text-footnote text-label-secondary">
                    <span>{t("auth:LOGIN_EMAIL_CODE_RESEND_PREFIX")} </span>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-footnote"
                      disabled={
                        requestRemovePasswordMutation.isPending || removePasswordRetryAfter > 0
                      }
                      onClick={() => void requestRemovePasswordCode()}
                    >
                      {removePasswordRetryAfter > 0
                        ? t("auth:LOGIN_EMAIL_CODE_RESEND_WAIT", {
                            countdown: `${removePasswordRetryAfter}s`,
                          })
                        : t("auth:LOGIN_EMAIL_CODE_RESEND_ACTION")}
                    </Button>
                  </div>
                </div>
              </DialogField>
            )
          ) : (
            <>
              {hasPassword ? (
                <DialogField
                  label={t("account:ME_SECURITY_OLD_PASSWORD")}
                  htmlFor={oldPasswordFieldId}
                  error={form.formState.errors.oldPassword?.message}
                >
                  <PasswordInput
                    id={oldPasswordFieldId}
                    {...form.register("oldPassword")}
                    autoComplete="current-password"
                    placeholder={t("auth:FIELD_PASSWORD_PLACEHOLDER")}
                  />
                </DialogField>
              ) : null}

              <DialogField
                label={t("account:ME_SECURITY_NEW_PASSWORD")}
                htmlFor={newPasswordFieldId}
                error={form.formState.errors.newPassword?.message}
              >
                <>
                  <PasswordInput
                    id={newPasswordFieldId}
                    {...form.register("newPassword")}
                    autoComplete="new-password"
                    placeholder={t("auth:FIELD_NEW_PASSWORD_PLACEHOLDER")}
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
                htmlFor={confirmPasswordFieldId}
                error={form.formState.errors.confirmPassword?.message}
              >
                <PasswordInput
                  id={confirmPasswordFieldId}
                  {...form.register("confirmPassword")}
                  autoComplete="new-password"
                  placeholder={t("auth:FIELD_CONFIRM_PASSWORD_PLACEHOLDER")}
                />
              </DialogField>

              {requiresSetPasswordRelogin ? (
                <div className="text-callout text-label-secondary">
                  {t("account:ME_PROFILE_SET_PASSWORD_RELOGIN_REQUIRED")}
                </div>
              ) : null}
            </>
          )}
        </SettingDialogFields>
      </SettingDialog>
      {securityVerification.verificationDialog}
    </>
  );
}
