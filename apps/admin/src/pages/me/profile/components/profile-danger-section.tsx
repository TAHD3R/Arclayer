import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, Form, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { SettingCard, SettingCardHeader } from "@celestial/ui/setting-card";
import type { DeleteMyAccountPayload } from "@/types/api";
import { SettingDialog } from "@celestial/ui/setting-dialog";

export type MeProfileDangerSectionProps = {
  email: string | null;
  redirect: string;
};

type DeleteAccountFormValues = {
  email: string;
  password?: string;
  code?: string;
  backupCode?: string;
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

export function MeProfileDangerSection(props: MeProfileDangerSectionProps) {
  const { t } = useTranslation(["account", "auth", "errors", "common"]);
  const navigate = useNavigate();
  const clearAuth = useAuthStore((s) => s.clear);
  const clearWorkspace = useWorkspaceStore((s) => s.clearWorkspace);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<DeleteAccountFormValues>();

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

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ email: "", password: "", code: "", backupCode: "" });
  }, [form, open]);

  const deleteMutation = useMutation({
    mutationFn: async (values: DeleteAccountFormValues) => {
      const payload: DeleteMyAccountPayload = { email: values.email };
      if (requiresPassword && values.password) payload.password = values.password;
      if (requiresTwoFactor && values.code) payload.code = values.code;
      if (requiresTwoFactor && values.backupCode) payload.backupCode = values.backupCode;
      return authApi.deleteMyAccount(payload);
    },
    onSuccess: async () => {
      notifySuccessText(t("account:ME_DELETE_ACCOUNT_SUCCESS"));
      clearAuth();
      clearWorkspace();
      setOpen(false);
      form.resetFields();
      await navigate({ to: "/login", replace: true });
    },
    onError: (err) => notifyError(err),
  });

  const dialogDescription = useMemo(() => {
    if (requiresTwoFactor) return t("account:ME_DELETE_ACCOUNT_DIALOG_DESC_2FA");
    if (requiresRelogin) return t("account:ME_DELETE_ACCOUNT_DIALOG_DESC_RELOGIN");
    return t("account:ME_DELETE_ACCOUNT_DIALOG_DESC");
  }, [requiresRelogin, requiresTwoFactor, t]);

  const actionDescription = useMemo(() => {
    if (!blockedReasonText) return t("account:ME_DELETE_ACCOUNT_DESC");
    return (
      <div className="grid gap-1">
        <div>{t("account:ME_DELETE_ACCOUNT_DESC")}</div>
        <div className="text-destructive">{blockedReasonText}</div>
      </div>
    );
  }, [blockedReasonText, t]);

  const canOpenDialog = !capabilityQuery.isLoading && !capabilityQuery.isError && canDelete;
  const deleteButtonDisabled =
    deleteMutation.isPending || capabilityQuery.isLoading || requiresRelogin || !canDelete;

  return (
    <>
      <div className="flex flex-col gap-6">
        <SettingCard className="border-destructive/30">
          <SettingCardHeader
            title={t("account:ME_DELETE_ACCOUNT_TITLE")}
            description={actionDescription}
            action={
              <Button
                danger
                type="primary"
                disabled={!canOpenDialog}
                onClick={() => setOpen(true)}
                autoInsertSpace={false}
              >
                {t("account:ME_DELETE_ACCOUNT_ACTION")}
              </Button>
            }
          />
        </SettingCard>
      </div>

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) form.resetFields();
          setOpen(next);
        }}
        title={t("account:ME_DELETE_ACCOUNT_DIALOG_TITLE")}
        description={dialogDescription}
        footer={
          <>
            <Button
              type="text"
              disabled={deleteMutation.isPending}
              onClick={() => setOpen(false)}
              autoInsertSpace={false}
            >
              {t("common:CANCEL")}
            </Button>
            {requiresRelogin ? (
              <Button
                type="primary"
                onClick={() => {
                  void navigate({
                    to: "/login",
                    search: { redirect: props.redirect },
                    replace: true,
                  });
                }}
                autoInsertSpace={false}
              >
                {t("account:ME_DELETE_ACCOUNT_RELOGIN_ACTION")}
              </Button>
            ) : null}
            <Button
              danger
              type="primary"
              disabled={deleteButtonDisabled}
              loading={deleteMutation.isPending}
              onClick={() => {
                void (async () => {
                  const values = await form.validateFields();
                  await deleteMutation.mutateAsync(values);
                })();
              }}
              autoInsertSpace={false}
            >
              {t("account:ME_DELETE_ACCOUNT_ACTION")}
            </Button>
          </>
        }
      >
        <div className="max-w-xl">
          <Alert
            type={requiresRelogin ? "info" : "warning"}
            showIcon
            title={t("account:ME_DELETE_ACCOUNT_ALERT_TITLE")}
            description={
              requiresRelogin
                ? t("account:ME_DELETE_ACCOUNT_RELOGIN_REQUIRED")
                : t("account:ME_DELETE_ACCOUNT_ALERT_DESC")
            }
            className="mb-4"
          />

          <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
            <Form.Item
              name="email"
              label={t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL")}
              rules={[
                { required: true, message: t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_REQUIRED") },
                { type: "email", message: t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_INVALID") },
              ]}
              className="mb-4"
            >
              <Input
                placeholder={
                  normalizedEmail || t("account:ME_DELETE_ACCOUNT_CONFIRM_EMAIL_PLACEHOLDER")
                }
              />
            </Form.Item>

            {requiresPassword ? (
              <Form.Item
                name="password"
                label={t("account:ME_DELETE_ACCOUNT_CONFIRM_PASSWORD")}
                rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                className="mb-0!"
              >
                <Input.Password
                  autoComplete="current-password"
                  placeholder={t("account:ME_DELETE_ACCOUNT_PASSWORD_PLACEHOLDER")}
                />
              </Form.Item>
            ) : null}

            {requiresTwoFactor ? (
              <>
                <Form.Item
                  name="code"
                  label={t("account:ME_DELETE_ACCOUNT_2FA_CODE")}
                  rules={[
                    {
                      validator: async (_, value) => {
                        const backupCode = String(form.getFieldValue("backupCode") || "").trim();
                        const code = String(value || "").trim();
                        if (!code && !backupCode) {
                          throw new Error(t("account:ME_DELETE_ACCOUNT_2FA_ONE_OF_REQUIRED"));
                        }
                        if (code && backupCode) {
                          throw new Error(t("account:ME_DELETE_ACCOUNT_2FA_MUTUALLY_EXCLUSIVE"));
                        }
                      },
                    },
                  ]}
                  className="mb-4"
                >
                  <Input placeholder={t("account:ME_DELETE_ACCOUNT_2FA_CODE_PLACEHOLDER")} />
                </Form.Item>
                <Form.Item
                  name="backupCode"
                  label={t("account:ME_DELETE_ACCOUNT_2FA_BACKUP_CODE")}
                  rules={[
                    {
                      validator: async (_, value) => {
                        const code = String(form.getFieldValue("code") || "").trim();
                        const backupCode = String(value || "").trim();
                        if (!code && !backupCode) {
                          throw new Error(t("account:ME_DELETE_ACCOUNT_2FA_ONE_OF_REQUIRED"));
                        }
                        if (code && backupCode) {
                          throw new Error(t("account:ME_DELETE_ACCOUNT_2FA_MUTUALLY_EXCLUSIVE"));
                        }
                      },
                    },
                  ]}
                  className="mb-0!"
                >
                  <Input placeholder={t("account:ME_DELETE_ACCOUNT_2FA_BACKUP_CODE_PLACEHOLDER")} />
                </Form.Item>
              </>
            ) : null}

            {requiresRelogin ? (
              <div className="text-callout text-label-secondary">
                {t("account:ME_DELETE_ACCOUNT_RELOGIN_REQUIRED")}
              </div>
            ) : null}
          </Form>
        </div>
      </SettingDialog>
    </>
  );
}
