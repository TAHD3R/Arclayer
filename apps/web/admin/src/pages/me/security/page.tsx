import { useMutation } from "@tanstack/react-query";
import { Button, Form, Input, message } from "antd";
import { useTranslation } from "react-i18next";

import * as authApi from "@/api/auth";
import { Accordion } from "@/components/ui/accordion";
import { SettingAccordionItem } from "@/components/settings-primitives/setting-accordion-item";
import { SettingPanel } from "@/components/settings-primitives/setting-panel";

type ChangePasswordFormValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function MeSecurityPage() {
  const { t } = useTranslation(["account", "auth", "settings"]);
  const [form] = Form.useForm<ChangePasswordFormValues>();

  const changePasswordMutation = useMutation({
    mutationFn: async (values: { oldPassword: string; newPassword: string }) => {
      return authApi.changePassword({
        old_password: values.oldPassword,
        new_password: values.newPassword,
      });
    },
    onSuccess: async () => {
      message.success(t("account:ME_SECURITY_PASSWORD_CHANGED"));
      form.resetFields();
    },
    onError: () => {
      message.error(t("account:ME_SECURITY_PASSWORD_CHANGE_FAILED"));
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <SettingPanel
        title={t("account:ME_SECURITY_PANEL_TITLE")}
        description={t("account:ME_SECURITY_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="change_password"
              variant="action"
              title={t("account:ME_SECURITY_CHANGE_PASSWORD_TITLE")}
              description={t("account:ME_SECURITY_CHANGE_PASSWORD_DESC")}
              showSummary={false}
              keepRendered
              confirmText={t("settings:SETTINGS_SAVE")}
              confirmLoading={changePasswordMutation.isPending}
              onConfirm={() =>
                void (async () => {
                  const values = await form.validateFields();
                  await changePasswordMutation.mutateAsync({
                    oldPassword: values.oldPassword,
                    newPassword: values.newPassword,
                  });
                })()
              }
            >
              <Form form={form} layout="vertical" requiredMark={false} autoComplete="off">
                <Form.Item<ChangePasswordFormValues>
                  name="oldPassword"
                  label={t("account:ME_SECURITY_OLD_PASSWORD")}
                  rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                  style={{ marginBottom: 12 }}
                >
                  <Input.Password autoComplete="current-password" size="large" />
                </Form.Item>

                <Form.Item<ChangePasswordFormValues>
                  name="newPassword"
                  label={t("account:ME_SECURITY_NEW_PASSWORD")}
                  rules={[{ required: true, message: t("auth:VALIDATION_PASSWORD_REQUIRED") }]}
                  style={{ marginBottom: 12 }}
                >
                  <Input.Password autoComplete="new-password" size="large" />
                </Form.Item>

                <Form.Item<ChangePasswordFormValues>
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
                  style={{ marginBottom: 0 }}
                >
                  <Input.Password autoComplete="new-password" size="large" />
                </Form.Item>
              </Form>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("account:ME_SECURITY_2FA_PANEL_TITLE")}
        description={t("account:ME_SECURITY_2FA_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-headline font-semibold">
                {t("account:ME_SECURITY_2FA_TITLE")}
              </div>
              <div className="mt-1 text-callout text-label-secondary">
                {t("account:ME_SECURITY_2FA_DISABLED_DESC")}
              </div>
            </div>
            <Button disabled type="primary">
              {t("account:ME_SECURITY_2FA_ENABLE")}
            </Button>
          </div>
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("account:ME_SECURITY_SESSIONS_PANEL_TITLE")}
        description={t("account:ME_SECURITY_SESSIONS_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-callout text-label-secondary">
            {t("account:ME_SECURITY_SESSIONS_DISABLED_DESC")}
          </div>
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("account:ME_SECURITY_SIGNIN_PANEL_TITLE")}
        description={t("account:ME_SECURITY_SIGNIN_PANEL_DESC")}
      >
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-callout text-label-secondary">
            {t("account:ME_SECURITY_SIGNIN_DISABLED_DESC")}
          </div>
        </div>
      </SettingPanel>
    </div>
  );
}
