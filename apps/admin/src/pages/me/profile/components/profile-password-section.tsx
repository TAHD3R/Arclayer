import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button, Form, Input } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useAuthStore } from "@/stores/use-auth-store";
import { SettingCard, SettingCardHeader } from "@celestial/ui/setting-card";
import { SettingDialog } from "@celestial/ui/setting-dialog";

export type MeProfilePasswordSectionProps = {
  redirect: string;
};

type PasswordFormValues = {
  oldPassword?: string;
  newPassword: string;
  confirmPassword: string;
  code?: string;
  backupCode?: string;
};

function resolveReauthMethods(data: unknown, key: "set" | "email"): string[] {
  if (!data || typeof data !== "object") return [];
  if (key === "set") {
    const methods =
      (data as { setPasswordRequiredReauthMethods?: string[] }).setPasswordRequiredReauthMethods ??
      (data as { set_password_required_reauth_methods?: string[] })
        .set_password_required_reauth_methods;
    return Array.isArray(methods) ? methods : [];
  }
  const methods =
    (data as { emailChangeRequiredReauthMethods?: string[] }).emailChangeRequiredReauthMethods ??
    (data as { email_change_required_reauth_methods?: string[] })
      .email_change_required_reauth_methods;
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

export function MeProfilePasswordSection(props: MeProfilePasswordSectionProps) {
  const { t } = useTranslation(["account", "auth", "settings", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<PasswordFormValues>();

  const capabilityQuery = useQuery({
    queryKey: ["auth", "security-capabilities", sessionVersion],
    queryFn: async () => authApi.getMySecurityCapabilities(),
    retry: false,
    staleTime: 60 * 1000,
    meta: { silent: true },
  });

  const hasPassword = resolveHasPassword(capabilityQuery.data);
  const setPasswordReauthMethods = resolveReauthMethods(capabilityQuery.data, "set");
  const requiresSetPasswordTwoFactor = !hasPassword && setPasswordReauthMethods.includes("2fa");
  const requiresSetPasswordRelogin = !hasPassword && setPasswordReauthMethods.includes("relogin");

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
    form.setFieldsValue({
      oldPassword: "",
      newPassword: "",
      confirmPassword: "",
      code: "",
      backupCode: "",
    });
  }, [form, open]);

  const changePasswordMutation = useMutation({
    mutationFn: async (values: PasswordFormValues) => {
      if (hasPassword) {
        return authApi.changePassword({
          old_password: String(values.oldPassword || ""),
          new_password: values.newPassword,
        });
      }
      return authApi.setMyPassword({
        new_password: values.newPassword,
        ...(requiresSetPasswordTwoFactor && values.code ? { code: values.code } : {}),
        ...(requiresSetPasswordTwoFactor && values.backupCode
          ? { backup_code: values.backupCode }
          : {}),
      });
    },
    onSuccess: async () => {
      notifySuccessText(
        hasPassword
          ? t("account:ME_SECURITY_PASSWORD_CHANGED")
          : t("account:ME_PROFILE_SET_PASSWORD_SUCCESS"),
      );
      form.resetFields();
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
            <Button
              type="primary"
              disabled={!canOpenDialog}
              onClick={() => setOpen(true)}
              autoInsertSpace={false}
            >
              {actionText}
            </Button>
          }
        />
      </SettingCard>

      <SettingDialog
        open={open}
        onOpenChange={(next) => {
          if (!next && isBusy) return;
          if (!next) form.resetFields();
          setOpen(next);
        }}
        title={dialogTitle}
        description={dialogDescription}
        footer={
          <>
            <Button
              type="text"
              disabled={isBusy}
              onClick={() => setOpen(false)}
              autoInsertSpace={false}
            >
              {t("common:CANCEL")}
            </Button>
            {requiresSetPasswordRelogin ? (
              <Button
                type="primary"
                onClick={() => {
                  setOpen(false);
                  void navigate({
                    to: "/login",
                    search: { redirect: props.redirect },
                    replace: true,
                  });
                }}
                autoInsertSpace={false}
              >
                {t("account:ME_PROFILE_SET_PASSWORD_RELOGIN_ACTION")}
              </Button>
            ) : null}
            <Button
              type="primary"
              loading={changePasswordMutation.isPending}
              disabled={saveDisabled}
              onClick={() =>
                void (async () => {
                  const values = await form.validateFields();
                  await changePasswordMutation.mutateAsync(values);
                })()
              }
              autoInsertSpace={false}
            >
              {t("settings:SETTINGS_SAVE")}
            </Button>
          </>
        }
      >
        <div className="max-w-xl">
          <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
            {hasPassword ? (
              <Form.Item<PasswordFormValues>
                name="oldPassword"
                label={t("account:ME_SECURITY_OLD_PASSWORD")}
                rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                className="mb-4"
              >
                <Input.Password autoComplete="current-password" />
              </Form.Item>
            ) : null}

            <Form.Item<PasswordFormValues>
              name="newPassword"
              label={t("account:ME_SECURITY_NEW_PASSWORD")}
              rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
              className="mb-4"
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>

            <Form.Item<PasswordFormValues>
              name="confirmPassword"
              label={t("account:ME_SECURITY_CONFIRM_PASSWORD")}
              dependencies={["newPassword"]}
              rules={[
                { required: true, message: t("auth:VALIDATION_CONFIRM_PASSWORD_REQUIRED") },
                ({ getFieldValue }) => ({
                  validator: async (_, value) => {
                    const pwd = getFieldValue("newPassword");
                    if (!value || value === pwd) return;
                    throw new Error(t("auth:VALIDATION_PASSWORD_MISMATCH"));
                  },
                }),
              ]}
              className={requiresSetPasswordTwoFactor ? "mb-4" : "mb-0!"}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>

            {requiresSetPasswordTwoFactor ? (
              <>
                <Form.Item<PasswordFormValues>
                  name="code"
                  label={t("account:ME_PROFILE_PASSWORD_2FA_CODE")}
                  rules={[
                    {
                      validator: async (_, value) => {
                        const backupCode = String(form.getFieldValue("backupCode") || "").trim();
                        const code = String(value || "").trim();
                        if (!code && !backupCode) {
                          throw new Error(t("account:ME_PROFILE_PASSWORD_2FA_ONE_OF_REQUIRED"));
                        }
                        if (code && backupCode) {
                          throw new Error(t("account:ME_PROFILE_PASSWORD_2FA_MUTUALLY_EXCLUSIVE"));
                        }
                      },
                    },
                  ]}
                  className="mb-4"
                >
                  <Input placeholder={t("account:ME_PROFILE_PASSWORD_2FA_CODE_PLACEHOLDER")} />
                </Form.Item>
                <Form.Item<PasswordFormValues>
                  name="backupCode"
                  label={t("account:ME_PROFILE_PASSWORD_2FA_BACKUP_CODE")}
                  rules={[
                    {
                      validator: async (_, value) => {
                        const code = String(form.getFieldValue("code") || "").trim();
                        const backupCode = String(value || "").trim();
                        if (!code && !backupCode) {
                          throw new Error(t("account:ME_PROFILE_PASSWORD_2FA_ONE_OF_REQUIRED"));
                        }
                        if (code && backupCode) {
                          throw new Error(t("account:ME_PROFILE_PASSWORD_2FA_MUTUALLY_EXCLUSIVE"));
                        }
                      },
                    },
                  ]}
                  className="mb-0!"
                >
                  <Input
                    placeholder={t("account:ME_PROFILE_PASSWORD_2FA_BACKUP_CODE_PLACEHOLDER")}
                  />
                </Form.Item>
              </>
            ) : null}

            {requiresSetPasswordRelogin ? (
              <div className="text-callout text-label-secondary">
                {t("account:ME_PROFILE_SET_PASSWORD_RELOGIN_REQUIRED")}
              </div>
            ) : null}
          </Form>
        </div>
      </SettingDialog>
    </>
  );
}
