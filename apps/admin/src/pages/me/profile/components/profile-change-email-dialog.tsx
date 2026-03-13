import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { SettingDialog } from "@celestial/ui/setting-dialog";

export type MeProfileChangeEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextEmail: string;
  redirect: string;
};

type ChangeEmailFormValues = {
  newEmail: string;
  code: string;
  password?: string;
  twoFactorCode?: string;
  backupCode?: string;
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

export function MeProfileChangeEmailDialog(props: MeProfileChangeEmailDialogProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [form] = Form.useForm<ChangeEmailFormValues>();

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

  useEffect(() => {
    if (!props.open) return;
    form.setFieldsValue({
      newEmail: normalizedEmail,
      code: "",
      password: "",
      twoFactorCode: "",
      backupCode: "",
    });
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
        ...(requiresPassword && payload.password ? { password: payload.password } : {}),
        ...(requiresTwoFactor && payload.twoFactorCode
          ? { two_factor_code: payload.twoFactorCode }
          : {}),
        ...(requiresTwoFactor && payload.backupCode ? { backup_code: payload.backupCode } : {}),
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("settings:SETTINGS_SAVED"));
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      props.onOpenChange(false);
      form.resetFields();
    },
    onError: (err) => notifyError(err),
  });

  const isBusy = requestCodeMutation.isPending || confirmMutation.isPending;

  const closeIfIdle = (open: boolean) => {
    if (!open && isBusy) return;
    if (!open) form.resetFields();
    props.onOpenChange(open);
  };

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
          <Button
            type="text"
            disabled={isBusy}
            onClick={() => closeIfIdle(false)}
            autoInsertSpace={false}
          >
            {t("auth:MODAL_CANCEL")}
          </Button>
          {requiresRelogin ? (
            <Button
              type="primary"
              onClick={() => {
                closeIfIdle(false);
                void navigate({
                  to: "/login",
                  search: { redirect: props.redirect },
                  replace: true,
                });
              }}
              autoInsertSpace={false}
            >
              {t("account:ME_PROFILE_EMAIL_RELOGIN_ACTION")}
            </Button>
          ) : null}
          <Button
            type="primary"
            loading={confirmMutation.isPending}
            disabled={saveDisabled}
            onClick={() => {
              void (async () => {
                const values = await form.validateFields();
                await confirmMutation.mutateAsync(values);
              })();
            }}
            autoInsertSpace={false}
          >
            {t("settings:SETTINGS_SAVE")}
          </Button>
        </>
      }
    >
      <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
        <Form.Item
          name="newEmail"
          label={t("account:ME_PROFILE_EMAIL_NEW_EMAIL")}
          rules={[
            { required: true, message: t("account:ME_PROFILE_EMAIL_NEW_EMAIL_REQUIRED") },
            { type: "email", message: t("account:ME_PROFILE_EMAIL_NEW_EMAIL_INVALID") },
          ]}
          className="mb-4"
        >
          <Input placeholder={t("account:ME_PROFILE_EMAIL_NEW_EMAIL_PLACEHOLDER")} />
        </Form.Item>

        <Form.Item
          name="code"
          label={t("account:ME_PROFILE_EMAIL_CODE")}
          rules={[{ required: true, message: t("account:ME_PROFILE_EMAIL_CODE_REQUIRED") }]}
          className="mb-4"
        >
          <Input
            placeholder={t("account:ME_PROFILE_EMAIL_CODE_PLACEHOLDER")}
            addonAfter={
              <Button
                type="link"
                className="px-0!"
                disabled={isBusy || capabilityQuery.isLoading || capabilityQuery.isError}
                onClick={() => {
                  void (async () => {
                    const values = await form.validateFields(["newEmail"]);
                    await requestCodeMutation.mutateAsync({ newEmail: values.newEmail });
                  })();
                }}
                autoInsertSpace={false}
              >
                {requestCodeMutation.isPending
                  ? t("account:ME_PROFILE_EMAIL_SENDING_CODE")
                  : t("account:ME_PROFILE_EMAIL_SEND_CODE")}
              </Button>
            }
          />
        </Form.Item>

        {requiresPassword ? (
          <>
            <Form.Item
              name="password"
              label={t("account:ME_PROFILE_EMAIL_PASSWORD")}
              rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
              className="mb-2"
            >
              <Input.Password placeholder={t("account:ME_PROFILE_EMAIL_PASSWORD_PLACEHOLDER")} />
            </Form.Item>

            <Button
              type="link"
              className="px-0!"
              disabled={isBusy}
              onClick={() => {
                closeIfIdle(false);
                void navigate({ to: "/reset-password" });
              }}
              autoInsertSpace={false}
            >
              {t("account:ME_PROFILE_EMAIL_FORGOT_PASSWORD")}
            </Button>
          </>
        ) : null}

        {requiresTwoFactor ? (
          <>
            <Form.Item
              name="twoFactorCode"
              label={t("account:ME_PROFILE_EMAIL_2FA_CODE")}
              rules={[
                {
                  validator: async (_, value) => {
                    const backupCode = String(form.getFieldValue("backupCode") || "").trim();
                    const code = String(value || "").trim();
                    if (!code && !backupCode) {
                      throw new Error(t("account:ME_PROFILE_EMAIL_2FA_ONE_OF_REQUIRED"));
                    }
                    if (code && backupCode) {
                      throw new Error(t("account:ME_PROFILE_EMAIL_2FA_MUTUALLY_EXCLUSIVE"));
                    }
                  },
                },
              ]}
              className="mb-4"
            >
              <Input placeholder={t("account:ME_PROFILE_EMAIL_2FA_CODE_PLACEHOLDER")} />
            </Form.Item>
            <Form.Item
              name="backupCode"
              label={t("account:ME_PROFILE_EMAIL_2FA_BACKUP_CODE")}
              rules={[
                {
                  validator: async (_, value) => {
                    const code = String(form.getFieldValue("twoFactorCode") || "").trim();
                    const backupCode = String(value || "").trim();
                    if (!code && !backupCode) {
                      throw new Error(t("account:ME_PROFILE_EMAIL_2FA_ONE_OF_REQUIRED"));
                    }
                    if (code && backupCode) {
                      throw new Error(t("account:ME_PROFILE_EMAIL_2FA_MUTUALLY_EXCLUSIVE"));
                    }
                  },
                },
              ]}
              className="mb-0!"
            >
              <Input placeholder={t("account:ME_PROFILE_EMAIL_2FA_BACKUP_CODE_PLACEHOLDER")} />
            </Form.Item>
          </>
        ) : null}

        {requiresRelogin ? (
          <div className="text-callout text-label-secondary">
            {t("account:ME_PROFILE_EMAIL_RELOGIN_REQUIRED")}
          </div>
        ) : null}

        {capabilityQuery.isError ? (
          <div className="text-callout text-destructive mt-1">
            {t("account:ME_PROFILE_PASSWORD_CAPABILITY_LOAD_FAILED")}
          </div>
        ) : null}
      </Form>
    </SettingDialog>
  );
}
