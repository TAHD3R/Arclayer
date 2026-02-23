import { Button, Checkbox, Form, Input, InputNumber, Switch } from "antd";
import type { FormInstance } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Accordion } from "@/components/ui/accordion";
import { SettingAccordionItem } from "@/components/common/setting-accordion-item";
import { SettingActionItem } from "@/components/common/setting-action-item";
import { SettingOverlayFooter } from "@/components/common/setting-overlay-footer";
import { SettingPanel } from "@/components/common/setting-panel";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import { sendTestEmail } from "@/api/mail";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import type { GeneralSettingsFormValues } from "@/types/settings-general";
import { normalizeOptionalString } from "@/lib/settings/general/utils";

type OverlayKey = "mailConfig";

type MessagingSettingsTabProps = GeneralSettingsTabBaseProps & {
  coreSecrets?: Record<string, boolean>;
};

function useField<T>(
  form: FormInstance<GeneralSettingsFormValues>,
  name: keyof GeneralSettingsFormValues,
): T | undefined {
  return Form.useWatch(name as string, form) as unknown as T | undefined;
}

function buildMailConfigSummary(params: {
  enabled: boolean;
  server: string;
  port: number;
  from: string;
}) {
  if (!params.enabled) return null;
  const host = (params.server || "").trim() || "-";
  const port = Number.isFinite(params.port) ? params.port : "-";
  const from = (params.from || "").trim() || "-";
  return `${host}:${port} · ${from}`;
}

export function MessagingSettingsTab({
  form,
  initialValues,
  disabled,
  savingKey,
  withSavingKey,
  patch,
  coreSecrets,
}: MessagingSettingsTabProps) {
  const { t } = useTranslation();
  const [testRecipient, setTestRecipient] = React.useState("");
  const [isTestingEmail, setIsTestingEmail] = React.useState(false);

  const mailEnabled = useField<boolean>(form, "mailEnabled") ?? initialValues.mailEnabled;

  const mailServer = useField<string>(form, "mailServer") ?? initialValues.mailServer;
  const mailPort = useField<number>(form, "mailPort") ?? initialValues.mailPort;
  const mailFrom = useField<string>(form, "mailFrom") ?? initialValues.mailFrom;

  const mailEnabledTemplates =
    useField<string[]>(form, "mailEnabledTemplates") ?? initialValues.mailEnabledTemplates;

  const inviteNotificationsEnabled =
    useField<boolean>(form, "notificationInviteEnabled") ?? initialValues.notificationInviteEnabled;

  const isTogglingMailEnabled = savingKey === "mail.enabled";
  const isSavingMailConfig = savingKey === "mail.config";
  const isResettingMailConfig = savingKey === "reset:mail.config";
  const isSavingMailTemplates = savingKey === "mail.templates";
  const isResettingMailTemplates = savingKey === "reset:mail.templates";
  const isSavingNotificationTypes = savingKey === "notifications.types";
  const isResettingNotificationTypes = savingKey === "reset:notifications.types";

  const hasMailPasswordSecret = Boolean(coreSecrets?.["mail.password"]);
  const mailConfigSummary = buildMailConfigSummary({
    enabled: mailEnabled,
    server: mailServer,
    port: Number(mailPort),
    from: mailFrom,
  });

  const setMailEnabled = (next: boolean) =>
    withSavingKey("mail.enabled", async () => {
      form.setFieldValue("mailEnabled", next);
      await patch({ mail: { enabled: Boolean(next) } });
    });

  const saveMailConfig = () =>
    withSavingKey("mail.config", async () => {
      const values = await form.validateFields([
        "mailServer",
        "mailPort",
        "mailUsername",
        "mailPassword",
        "mailFrom",
        "mailFromName",
        "mailStarttls",
        "mailSslTls",
      ]);

      const patchValue: Record<string, unknown> = {
        server: String(values.mailServer || "").trim() || "localhost",
        port: Number(values.mailPort || 0),
        username: normalizeOptionalString(values.mailUsername),
        mail_from: String(values.mailFrom || "").trim() || "noreply@example.com",
        mail_from_name: String(values.mailFromName || "").trim() || "Celestial CMS",
        starttls: Boolean(values.mailStarttls),
        ssl_tls: Boolean(values.mailSslTls),
      };

      // Secret fields never show existing value. Only overwrite when user provides a new value.
      const secret = String(values.mailPassword || "").trim();
      if (secret) {
        patchValue.password = secret;
        form.setFieldValue("mailPassword", "");
      }

      await patch({ mail: patchValue });
    });

  const resetMailConfig = () =>
    withSavingKey("reset:mail.config", async () => {
      form.setFieldsValue({
        mailServer: initialValues.mailServer,
        mailPort: initialValues.mailPort,
        mailUsername: initialValues.mailUsername,
        mailPassword: "",
        mailFrom: initialValues.mailFrom,
        mailFromName: initialValues.mailFromName,
        mailStarttls: initialValues.mailStarttls,
        mailSslTls: initialValues.mailSslTls,
      });
      await patch({
        mail: {
          server: initialValues.mailServer,
          port: Number(initialValues.mailPort),
          username: normalizeOptionalString(initialValues.mailUsername),
          mail_from: String(initialValues.mailFrom || "").trim() || "noreply@example.com",
          mail_from_name: String(initialValues.mailFromName || "").trim() || "Celestial CMS",
          starttls: Boolean(initialValues.mailStarttls),
          ssl_tls: Boolean(initialValues.mailSslTls),
        },
      });
    });

  const saveMailTemplates = () =>
    withSavingKey("mail.templates", async () => {
      const values = await form.validateFields(["mailEnabledTemplates"]);
      await patch({
        mail: {
          preferences: {
            enabled_templates: (values.mailEnabledTemplates || []) as string[],
          },
        },
      });
    });

  const resetMailTemplates = () =>
    withSavingKey("reset:mail.templates", async () => {
      form.setFieldValue("mailEnabledTemplates", initialValues.mailEnabledTemplates);
      await patch({
        mail: {
          preferences: {
            enabled_templates: initialValues.mailEnabledTemplates,
          },
        },
      });
    });

  const saveNotificationTypes = () =>
    withSavingKey("notifications.types", async () => {
      const values = await form.validateFields(["notificationInviteEnabled"]);
      await patch({
        notifications: {
          invite_enabled: Boolean(values.notificationInviteEnabled),
        },
      });
    });

  const resetNotificationTypes = () =>
    withSavingKey("reset:notifications.types", async () => {
      form.setFieldValue("notificationInviteEnabled", initialValues.notificationInviteEnabled);
      await patch({
        notifications: {
          invite_enabled: Boolean(initialValues.notificationInviteEnabled),
        },
      });
    });

  const overlayConfigs = React.useMemo<readonly SettingOverlayConfig<OverlayKey>[]>(() => {
    return [
      {
        key: "mailConfig",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_SHEET_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={isResettingMailConfig}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={isSavingMailConfig}
            disabled={disabled}
            onReset={resetMailConfig}
            onSave={saveMailConfig}
          />
        ),
        content: () => (
          <div className="space-y-6">
            <Form.Item<GeneralSettingsFormValues>
              name="mailServer"
              label={t("settings:SETTINGS_MESSAGING_MAIL_SERVER")}
              rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder="smtp.example.com" />
            </Form.Item>

            <Form.Item<GeneralSettingsFormValues>
              name="mailPort"
              label={t("settings:SETTINGS_MESSAGING_MAIL_PORT")}
              rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
              style={{ marginBottom: 0 }}
            >
              <InputNumber size="large" className="w-full" min={1} max={65535} />
            </Form.Item>

            <Form.Item<GeneralSettingsFormValues>
              name="mailUsername"
              label={t("settings:SETTINGS_MESSAGING_MAIL_USERNAME")}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder="username (optional)" autoComplete="off" />
            </Form.Item>

            <Form.Item<GeneralSettingsFormValues>
              name="mailPassword"
              label={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD")}
              extra={
                hasMailPasswordSecret
                  ? t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_SET")
                  : t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_NOT_SET")
              }
              style={{ marginBottom: 0 }}
            >
              <Input.Password
                size="large"
                autoComplete="new-password"
                placeholder={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER")}
              />
            </Form.Item>

            <Form.Item<GeneralSettingsFormValues>
              name="mailFrom"
              label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}
              rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder="noreply@example.com" />
            </Form.Item>

            <Form.Item<GeneralSettingsFormValues>
              name="mailFromName"
              label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}
              rules={[{ required: true, message: t("settings:SETTINGS_VALIDATION_REQUIRED") }]}
              style={{ marginBottom: 0 }}
            >
              <Input size="large" placeholder="Celestial CMS" />
            </Form.Item>

            <div className="grid grid-cols-2 gap-3">
              <Form.Item<GeneralSettingsFormValues>
                name="mailStarttls"
                valuePropName="checked"
                label={t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS")}
                style={{ marginBottom: 0 }}
              >
                <Switch />
              </Form.Item>

              <Form.Item<GeneralSettingsFormValues>
                name="mailSslTls"
                valuePropName="checked"
                label={t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}
                style={{ marginBottom: 0 }}
              >
                <Switch />
              </Form.Item>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-semibold">
                {t("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t("settings:SETTINGS_MESSAGING_MAIL_TEST_DESC")}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Input
                  size="large"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder={t("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER")}
                  autoComplete="off"
                />
                <Button
                  type="primary"
                  loading={isTestingEmail}
                  disabled={disabled || !mailEnabled || !String(testRecipient || "").trim()}
                  onClick={() => {
                    const recipient = String(testRecipient || "").trim();
                    if (!recipient) return;
                    setIsTestingEmail(true);
                    sendTestEmail({ recipient })
                      .then(() =>
                        notifySuccessText(t("settings:SETTINGS_MESSAGING_MAIL_TEST_SUCCESS")),
                      )
                      .catch((err) => notifyError(err))
                      .finally(() => setIsTestingEmail(false));
                  }}
                >
                  {t("settings:SETTINGS_MESSAGING_MAIL_TEST_ACTION")}
                </Button>
              </div>
            </div>
          </div>
        ),
      },
    ] as const;
  }, [
    disabled,
    hasMailPasswordSecret,
    isTestingEmail,
    isResettingMailConfig,
    isSavingMailConfig,
    mailEnabled,
    resetMailConfig,
    saveMailConfig,
    testRecipient,
    t,
  ]);

  const overlays = useSettingOverlays(overlayConfigs);

  const mailTemplatesSummary = t("settings:SETTINGS_MESSAGING_SELECTED_COUNT", {
    count: mailEnabledTemplates.length,
  });

  const notificationSummary = inviteNotificationsEnabled
    ? t("settings:SETTINGS_MESSAGING_ENABLED")
    : t("settings:SETTINGS_MESSAGING_DISABLED");

  return (
    <div className="space-y-6">
      <SettingPanel
        title={t("settings:SETTINGS_MESSAGING_MAIL_PANEL_TITLE")}
        description={t("settings:SETTINGS_MESSAGING_MAIL_PANEL_DESC")}
        bordered={false}
      >
        <div className="rounded-xl bg-background divide-y">
          <SettingActionItem
            as="div"
            title={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE")}
            description={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_DESC")}
            summary={
              mailEnabled
                ? t("settings:SETTINGS_MESSAGING_ENABLED")
                : t("settings:SETTINGS_MESSAGING_DISABLED")
            }
            showChevron={false}
            right={
              <Switch
                checked={mailEnabled}
                loading={isTogglingMailEnabled}
                disabled={disabled}
                onChange={(checked) => void setMailEnabled(Boolean(checked))}
                onClick={(_checked, e) => e.stopPropagation()}
              />
            }
          />

          {mailEnabled ? (
            <>
              <SettingActionItem
                title={t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_TITLE")}
                description={t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_HELP")}
                summary={mailConfigSummary ?? t("settings:SETTINGS_NOT_SET")}
                disabled={disabled}
                onTrigger={() => overlays.open("mailConfig")}
              />

              <Accordion type="single" collapsible className="px-0">
                <SettingAccordionItem
                  value="mailTemplates"
                  title={t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATES_TITLE")}
                  description={t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATES_DESC")}
                  variant="action"
                  showSummary
                  summary={mailTemplatesSummary}
                  itemClassName="border-0"
                  contentClassName="px-4"
                  confirmText={t("settings:SETTINGS_SAVE")}
                  onConfirm={saveMailTemplates}
                  confirmLoading={isSavingMailTemplates}
                  onReset={resetMailTemplates}
                  resetLoading={isResettingMailTemplates}
                  disabled={disabled}
                >
                  <Form.Item<GeneralSettingsFormValues>
                    name="mailEnabledTemplates"
                    style={{ marginBottom: 0 }}
                  >
                    <Checkbox.Group
                      className="w-full flex flex-col gap-2"
                      options={[
                        {
                          value: "registration_prompt",
                          label: (
                            <div className="flex flex-col">
                              <div className="font-medium">
                                {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE")}
                              </div>
                              <div className="text-muted-foreground">
                                {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC")}
                              </div>
                            </div>
                          ),
                        },
                        {
                          value: "welcome_email",
                          label: (
                            <div className="flex flex-col">
                              <div className="font-medium">
                                {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE")}
                              </div>
                              <div className="text-muted-foreground">
                                {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC")}
                              </div>
                            </div>
                          ),
                        },
                      ]}
                    />
                  </Form.Item>
                </SettingAccordionItem>
              </Accordion>
            </>
          ) : null}
        </div>
      </SettingPanel>

      <SettingPanel
        title={t("settings:SETTINGS_MESSAGING_NOTIFICATION_PANEL_TITLE")}
        description={t("settings:SETTINGS_MESSAGING_NOTIFICATION_PANEL_DESC")}
        bordered={false}
      >
        <div className="rounded-xl bg-background divide-y">
          <Accordion type="single" collapsible className="px-0">
            <SettingAccordionItem
              value="notificationTypes"
              title={t("settings:SETTINGS_MESSAGING_NOTIFICATION_TYPES_TITLE")}
              description={t("settings:SETTINGS_MESSAGING_NOTIFICATION_TYPES_DESC")}
              variant="action"
              showSummary
              summary={notificationSummary}
              itemClassName="border-0"
              contentClassName="px-4"
              confirmText={t("settings:SETTINGS_SAVE")}
              onConfirm={saveNotificationTypes}
              confirmLoading={isSavingNotificationTypes}
              onReset={resetNotificationTypes}
              resetLoading={isResettingNotificationTypes}
              disabled={disabled}
            >
              <Form.Item<GeneralSettingsFormValues>
                name="notificationInviteEnabled"
                valuePropName="checked"
                style={{ marginBottom: 0 }}
              >
                <Checkbox>
                  <div className="flex flex-col">
                    <div className="font-medium">
                      {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")}
                    </div>
                    <div className="text-muted-foreground">
                      {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_DESC")}
                    </div>
                  </div>
                </Checkbox>
              </Form.Item>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>

      {overlays.renderOverlays()}
    </div>
  );
}
