import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import * as authApi from "@/api/auth";
import { zodResolver } from "@/lib/forms/zod-resolver";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useSecurityActionVerification } from "@/pages/usercenter/shared/security-action-verification";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { SettingCard, SettingCardHeader } from "@arclayer/ui/setting-card";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";
import type { DeleteMyAccountRequest as DeleteMyAccountPayload } from "@arclayer/openapi";
import { DialogField } from "./dialog-field";

export type UserDangerSectionProps = {
  email: string | null;
  redirect: string;
};

type DeleteAccountFormValues = {
  email: string;
  password: string;
};

const EMPTY_VALUES: DeleteAccountFormValues = {
  email: "",
  password: "",
};

function getBlockedReasonText(
  code: string | null | undefined,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (!code) return null;
  const key = `errors:${code}`;
  const translated = t(key);
  return translated === key ? code : translated;
}

function buildDeleteAccountSchema(
  t: (key: string) => string,
  options: { requiresPassword: boolean },
) {
  return z
    .object({
      email: z
        .string()
        .min(1, t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_REQUIRED"))
        .email(t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_INVALID")),
      password: z.string(),
    })
    .superRefine((value, ctx) => {
      if (options.requiresPassword && !value.password.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: t("auth:VALIDATION_PASSWORD_REQUIRED"),
        });
      }
    });
}

export function UserDangerSection(props: UserDangerSectionProps) {
  const { t } = useTranslation(["account", "auth", "errors", "common"]);
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const securityVerification = useSecurityActionVerification();
  const [open, setOpen] = useState(false);

  const capabilityQuery = useQuery({
    queryKey: ["auth", "delete-capabilities", sessionVersion],
    queryFn: async () => authApi.getDeleteMyAccountCapabilities(),
    staleTime: 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const normalizedEmail = useMemo(() => {
    const fromCapability = capabilityQuery.data?.email;
    if (fromCapability) return String(fromCapability).trim();
    return props.email ? String(props.email).trim() : "";
  }, [capabilityQuery.data?.email, props.email]);

  const blockedReasonText = useMemo(
    () => getBlockedReasonText(capabilityQuery.data?.blockedReason, t),
    [capabilityQuery.data?.blockedReason, t],
  );

  const reauthMethods = capabilityQuery.data?.requiredReauthMethods ?? [];
  const requiresPassword = reauthMethods.includes("password");
  const requiresTwoFactor = reauthMethods.includes("2fa");
  const requiresRelogin = reauthMethods.includes("relogin");
  const canDelete = Boolean(capabilityQuery.data?.canDelete);

  const schema = useMemo(
    () => buildDeleteAccountSchema(t, { requiresPassword }),
    [requiresPassword, t],
  );

  const form = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
    mode: "onTouched",
  });
  const emailFieldId = useId();
  const passwordFieldId = useId();

  useEffect(() => {
    if (!open) return;
    form.reset(EMPTY_VALUES);
  }, [form, open]);

  const deleteMutation = useMutation({
    mutationFn: async (input: { values: DeleteAccountFormValues; mfaProof?: string }) => {
      const values = input.values;
      const payload: DeleteMyAccountPayload = { email: values.email };
      if (requiresPassword && values.password.trim()) payload.password = values.password.trim();
      payload.mfaProof = input.mfaProof;
      return authApi.deleteMyAccount(payload);
    },
    onSuccess: async () => {
      notifySuccessText(t("account:ME_DELETE_ACCOUNT_SUCCESS"));
      clearAuth();
      clearWorkspace();
      setOpen(false);
      form.reset(EMPTY_VALUES);
      await navigate({ to: "/login", replace: true });
    },
    onError: (err) => notifyError(err),
  });

  const dialogDescription = useMemo(() => {
    if (requiresTwoFactor) return t("account:ME_DELETE_ACCOUNT_DIALOG_DESC_2FA");
    if (requiresRelogin) return t("account:ME_DELETE_ACCOUNT_DIALOG_DESC_RELOGIN");
    return t("account:ME_DELETE_ACCOUNT_DIALOG_DESC");
  }, [requiresRelogin, requiresTwoFactor, t]);

  const actionDescription = useMemo(() => t("account:ME_DELETE_ACCOUNT_DESC"), [t]);

  const canOpenDialog = !capabilityQuery.isLoading && !capabilityQuery.isError && canDelete;
  const deleteButtonDisabled =
    deleteMutation.isPending || capabilityQuery.isLoading || requiresRelogin || !canDelete;
  const deleteAction = (
    <Button
      variant="destructive"
      aria-disabled={!canOpenDialog}
      className={cn(!canOpenDialog && "cursor-not-allowed opacity-50")}
      onClick={() => {
        if (!canOpenDialog) return;
        setOpen(true);
      }}
    >
      {t("account:ME_DELETE_ACCOUNT_ACTION")}
    </Button>
  );

  return (
    <>
      <div className="flex flex-col gap-6">
        <SettingCard className="border-destructive/30">
          <SettingCardHeader
            title={t("account:ME_DELETE_ACCOUNT_TITLE")}
            description={actionDescription}
            action={
              blockedReasonText ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild focusTrigger={false}>
                      <span data-testid="delete-account-tooltip-trigger">{deleteAction}</span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72 text-left">
                      {blockedReasonText}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                deleteAction
              )
            }
          />
        </SettingCard>
      </div>

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) form.reset(EMPTY_VALUES);
          setOpen(next);
        }}
        title={t("account:ME_DELETE_ACCOUNT_DIALOG_TITLE")}
        description={dialogDescription}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={deleteMutation.isPending}
              onClick={() => setOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            {requiresRelogin ? (
              <Button
                variant="primary"
                onClick={() => {
                  void navigate({
                    to: "/login",
                    search: { redirect: props.redirect },
                    replace: true,
                  });
                }}
              >
                {t("account:ME_DELETE_ACCOUNT_RELOGIN_ACTION")}
              </Button>
            ) : null}
            <Button
              variant="primary"
              disabled={deleteButtonDisabled}
              loading={deleteMutation.isPending}
              onClick={() => {
                void form.handleSubmit(async (values) => {
                  const verification = await securityVerification.requestProof("delete_my_account");
                  if (verification.cancelled) return;
                  await deleteMutation.mutateAsync({ values, mfaProof: verification.proof });
                })();
              }}
            >
              {t("account:ME_DELETE_ACCOUNT_ACTION")}
            </Button>
          </>
        }
      >
        <SettingDialogFields>
          <Alert variant="destructive" className="border-destructive/25 bg-destructive/6">
            <AlertTitle>{t("account:ME_DELETE_ACCOUNT_ALERT_TITLE")}</AlertTitle>
            <AlertDescription>
              {requiresRelogin
                ? t("account:ME_DELETE_ACCOUNT_RELOGIN_REQUIRED")
                : t("account:ME_DELETE_ACCOUNT_ALERT_DESC")}
            </AlertDescription>
          </Alert>

          <DialogField
            label={t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL")}
            description={
              normalizedEmail || t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_PLACEHOLDER")
            }
            htmlFor={emailFieldId}
            error={form.formState.errors.email?.message}
          >
            <Input
              id={emailFieldId}
              {...form.register("email")}
              placeholder={
                normalizedEmail || t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_PLACEHOLDER")
              }
            />
          </DialogField>

          {requiresPassword ? (
            <DialogField
              label={t("account:ME_DELETE_ACCOUNT_CONFIRM_PASSWORD")}
              description={t("account:ME_DELETE_ACCOUNT_PASSWORD_PLACEHOLDER")}
              htmlFor={passwordFieldId}
              error={form.formState.errors.password?.message}
            >
              <PasswordInput
                id={passwordFieldId}
                {...form.register("password")}
                autoComplete="current-password"
                placeholder={t("account:ME_DELETE_ACCOUNT_PASSWORD_PLACEHOLDER")}
              />
            </DialogField>
          ) : null}

          {requiresRelogin ? (
            <div className="text-callout text-label-secondary">
              {t("account:ME_DELETE_ACCOUNT_RELOGIN_REQUIRED")}
            </div>
          ) : null}
        </SettingDialogFields>
      </SettingDialog>
      {securityVerification.verificationDialog}
    </>
  );
}
