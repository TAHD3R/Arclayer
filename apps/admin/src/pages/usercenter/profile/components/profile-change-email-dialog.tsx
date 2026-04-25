import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import * as authApi from "@/api/auth";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { ApiError } from "@/lib/http";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { AuthOtpInput, AuthPaneTitleRow } from "@/pages/login/components/auth-pane-primitives";
import { useSecurityRelogin } from "@/pages/usercenter/shared/use-security-relogin";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { DialogField } from "./dialog-field";

export type UserChangeEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextEmail: string;
  redirect?: string;
};

type ChangeEmailDialogStep = "request" | "verify";

type ChangeEmailFormValues = {
  newEmail: string;
  code: string;
};

const OTP_LENGTH = 6;
const EMPTY_VALUES: ChangeEmailFormValues = {
  newEmail: "",
  code: "",
};

function buildSchema(t: (key: string) => string) {
  return z.object({
    newEmail: z
      .string()
      .min(1, t("account:ME_PROFILE_EMAIL_NEW_EMAIL_REQUIRED"))
      .email(t("account:ME_PROFILE_EMAIL_NEW_EMAIL_INVALID")),
    code: z
      .string()
      .trim()
      .min(OTP_LENGTH, t("account:ME_PROFILE_EMAIL_CODE_REQUIRED"))
      .max(OTP_LENGTH, t("account:ME_PROFILE_EMAIL_CODE_REQUIRED")),
  });
}

export function UserChangeEmailDialog(props: UserChangeEmailDialogProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const [step, setStep] = useState<ChangeEmailDialogStep>("request");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState(0);
  const forceRelogin = useSecurityRelogin(props.redirect);

  const normalizedEmail = useMemo(() => String(props.nextEmail || "").trim(), [props.nextEmail]);
  const schema = useMemo(() => buildSchema(t), [t]);

  const form = useForm<ChangeEmailFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_VALUES, newEmail: normalizedEmail },
    mode: "onSubmit",
  });
  const newEmailFieldId = useId();

  useEffect(() => {
    if (!props.open) return;
    form.reset({ ...EMPTY_VALUES, newEmail: normalizedEmail });
    setStep("request");
    setVerifyError(null);
    setRetryAfter(0);
  }, [form, normalizedEmail, props.open]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setInterval(() => {
      setRetryAfter((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter]);

  const requestCodeMutation = useMutation({
    mutationFn: async (payload: { newEmail: string }) => {
      return authApi.requestMyEmailChange({ new_email: payload.newEmail });
    },
    onSuccess: (result) => {
      setVerifyError(null);
      setStep("verify");
      setRetryAfter(result.retryAfter ?? result.retry_after);
      form.clearErrors("code");
      form.setValue("code", "");
      notifySuccessText(t("auth:LOGIN_CODE_SENT"));
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (payload: ChangeEmailFormValues) => {
      return authApi.confirmMyEmailChange({
        new_email: payload.newEmail,
        code: payload.code,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await forceRelogin();
    },
  });

  const isBusy = requestCodeMutation.isPending || confirmMutation.isPending;

  function closeIfIdle(open: boolean) {
    if (!open && isBusy) return;
    if (!open) {
      form.reset({ ...EMPTY_VALUES, newEmail: normalizedEmail });
      setStep("request");
      setVerifyError(null);
      setRetryAfter(0);
    }
    props.onOpenChange(open);
  }

  async function requestEmailCode() {
    const isValid = await form.trigger("newEmail");
    if (!isValid) return;
    try {
      await requestCodeMutation.mutateAsync({ newEmail: form.getValues("newEmail") });
    } catch (error) {
      setStep("request");
      notifyError(
        error instanceof ApiError
          ? error
          : new ApiError({ status: 400, message: t("auth:LOGIN_EMAIL_CODE_REQUEST_FAILED") }),
      );
    }
  }

  const submitVerification = form.handleSubmit(async (values) => {
    try {
      setVerifyError(null);
      await confirmMutation.mutateAsync(values);
    } catch (error) {
      setVerifyError(
        error instanceof ApiError ? error.message : t("auth:LOGIN_EMAIL_CODE_INVALID"),
      );
    }
  });

  return (
    <SettingDialog
      open={props.open}
      onOpenChange={closeIfIdle}
      title={t("account:ME_PROFILE_EMAIL_DIALOG_TITLE")}
      description={t("account:ME_PROFILE_EMAIL_DIALOG_DESC")}
      footer={
        <>
          <Button variant="ghost" disabled={isBusy} onClick={() => closeIfIdle(false)}>
            {t("common:CANCEL")}
          </Button>
          <Button
            variant="outline"
            loading={step === "request" ? requestCodeMutation.isPending : confirmMutation.isPending}
            disabled={isBusy}
            onClick={() => {
              if (step === "request") {
                void requestEmailCode();
                return;
              }
              void submitVerification();
            }}
          >
            {step === "request"
              ? t("account:ME_PROFILE_EMAIL_SEND_CODE")
              : t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <SettingDialogFields>
        {step === "request" ? (
          <DialogField
            label={t("account:ME_PROFILE_EMAIL_NEW_EMAIL")}
            htmlFor={newEmailFieldId}
            error={form.formState.errors.newEmail?.message}
          >
            <Input
              id={newEmailFieldId}
              autoComplete="email"
              placeholder={t("account:ME_PROFILE_EMAIL_NEW_EMAIL_PLACEHOLDER")}
              disabled={isBusy}
              {...form.register("newEmail")}
            />
          </DialogField>
        ) : null}

        {step === "verify" ? (
          <SettingDialogField
            title={
              <AuthPaneTitleRow
                title={t("account:ME_PROFILE_EMAIL_CODE")}
                action={
                  <div className="flex items-center gap-1 text-footnote text-label-secondary">
                    <span>{t("auth:LOGIN_EMAIL_CODE_RESEND_PREFIX")}</span>
                    <Button
                      variant="link"
                      size="inline"
                      className="h-auto p-0 text-footnote"
                      disabled={requestCodeMutation.isPending || retryAfter > 0}
                      onClick={() => void requestEmailCode()}
                    >
                      {retryAfter > 0
                        ? t("auth:LOGIN_EMAIL_CODE_RESEND_WAIT", { countdown: `${retryAfter}s` })
                        : t("auth:LOGIN_EMAIL_CODE_RESEND_ACTION")}
                    </Button>
                  </div>
                }
              />
            }
            error={form.formState.errors.code?.message ?? verifyError ?? undefined}
          >
            <div className="grid gap-3">
              <AuthOtpInput
                value={form.watch("code")}
                onChange={(value) => {
                  form.setValue("code", value, { shouldValidate: false });
                  if (form.formState.errors.code) form.clearErrors("code");
                  if (verifyError) setVerifyError(null);
                }}
                aria-label={t("account:ME_PROFILE_EMAIL_CODE")}
                invalid={Boolean(verifyError)}
                disabled={confirmMutation.isPending}
                maxLength={OTP_LENGTH}
              />
            </div>
          </SettingDialogField>
        ) : null}
      </SettingDialogFields>
    </SettingDialog>
  );
}
