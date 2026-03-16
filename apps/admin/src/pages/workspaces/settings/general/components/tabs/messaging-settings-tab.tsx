import * as React from "react";
import { Controller, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Accordion } from "@arclayer/ui/accordion";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { PasswordInput } from "@arclayer/ui/password-input";
import { Switch } from "@arclayer/ui/switch";
import { SettingAccordionItem } from "@arclayer/ui/setting-accordion-item";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";

import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import { NumberInput } from "@/components/ui/number-input";
import { sendTestEmail } from "@/api/mail";
import { notifyError, notifySuccessText } from "@/lib/notifications";

import type { GeneralSettingsTabBaseProps } from "@/types/settings-general";
import { normalizeOptionalString } from "@/lib/settings/general/utils";
import { getFieldErrorMessage, validateFormFields } from "../form-helpers";

type OverlayKey = "mailConfig";

type MessagingSettingsTabProps = GeneralSettingsTabBaseProps & {
  coreSecrets?: Record<string, boolean>;
};

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

function FieldMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="text-footnote text-destructive">{message}</div>;
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

  const mailEnabled =
    useWatch({ control: form.control, name: "mailEnabled" }) ?? initialValues.mailEnabled;
  const mailServer =
    useWatch({ control: form.control, name: "mailServer" }) ?? initialValues.mailServer;
  const mailPort = useWatch({ control: form.control, name: "mailPort" }) ?? initialValues.mailPort;
  const mailFrom = useWatch({ control: form.control, name: "mailFrom" }) ?? initialValues.mailFrom;
  const mailEnabledTemplates =
    useWatch({ control: form.control, name: "mailEnabledTemplates" }) ??
    initialValues.mailEnabledTemplates;
  const inviteNotificationsEnabled =
    useWatch({ control: form.control, name: "notificationInviteEnabled" }) ??
    initialValues.notificationInviteEnabled;

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
      form.setValue("mailEnabled", next, { shouldDirty: true });
      await patch({ mail: { enabled: Boolean(next) } });
    });

  const saveMailConfig = () =>
    withSavingKey("mail.config", async () => {
      const values = await validateFormFields(form, [
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
        mail_from_name: String(values.mailFromName || "").trim() || "Arclayer",
        starttls: Boolean(values.mailStarttls),
        ssl_tls: Boolean(values.mailSslTls),
      };

      const secret = String(values.mailPassword || "").trim();
      if (secret) {
        patchValue.password = secret;
        form.setValue("mailPassword", "", { shouldDirty: false });
      }

      await patch({ mail: patchValue });
    });

  const resetMailConfig = () =>
    withSavingKey("reset:mail.config", async () => {
      form.setValue("mailServer", initialValues.mailServer, { shouldDirty: false });
      form.setValue("mailPort", initialValues.mailPort, { shouldDirty: false });
      form.setValue("mailUsername", initialValues.mailUsername, { shouldDirty: false });
      form.setValue("mailPassword", "", { shouldDirty: false });
      form.setValue("mailFrom", initialValues.mailFrom, { shouldDirty: false });
      form.setValue("mailFromName", initialValues.mailFromName, { shouldDirty: false });
      form.setValue("mailStarttls", initialValues.mailStarttls, { shouldDirty: false });
      form.setValue("mailSslTls", initialValues.mailSslTls, { shouldDirty: false });
      form.clearErrors([
        "mailServer",
        "mailPort",
        "mailUsername",
        "mailPassword",
        "mailFrom",
        "mailFromName",
      ]);
      await patch({
        mail: {
          server: initialValues.mailServer,
          port: Number(initialValues.mailPort),
          username: normalizeOptionalString(initialValues.mailUsername),
          mail_from: String(initialValues.mailFrom || "").trim() || "noreply@example.com",
          mail_from_name: String(initialValues.mailFromName || "").trim() || "Arclayer",
          starttls: Boolean(initialValues.mailStarttls),
          ssl_tls: Boolean(initialValues.mailSslTls),
        },
      });
    });

  const saveMailTemplates = () =>
    withSavingKey("mail.templates", async () => {
      await patch({
        mail: {
          preferences: {
            enabled_templates: form.getValues("mailEnabledTemplates") || [],
          },
        },
      });
    });

  const resetMailTemplates = () =>
    withSavingKey("reset:mail.templates", async () => {
      form.setValue("mailEnabledTemplates", initialValues.mailEnabledTemplates, {
        shouldDirty: false,
      });
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
      await patch({
        notifications: {
          invite_enabled: Boolean(form.getValues("notificationInviteEnabled")),
        },
      });
    });

  const resetNotificationTypes = () =>
    withSavingKey("reset:notifications.types", async () => {
      form.setValue("notificationInviteEnabled", initialValues.notificationInviteEnabled, {
        shouldDirty: false,
      });
      await patch({
        notifications: {
          invite_enabled: Boolean(initialValues.notificationInviteEnabled),
        },
      });
    });

  const overlayConfigs = React.useMemo<readonly SettingOverlayConfig<OverlayKey>[]>(() => {
    const mailServerError = getFieldErrorMessage(form, "mailServer");
    const mailPortError = getFieldErrorMessage(form, "mailPort");
    const mailFromError = getFieldErrorMessage(form, "mailFrom");
    const mailFromNameError = getFieldErrorMessage(form, "mailFromName");

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
            <Controller
              control={form.control}
              name="mailServer"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_SERVER")}
                  </div>
                  <Input {...field} placeholder="smtp.example.com" autoComplete="off" />
                  <FieldMessage message={mailServerError} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="mailPort"
              rules={{
                validate: (value) => {
                  if (typeof value !== "number" || !Number.isFinite(value)) {
                    return t("settings:SETTINGS_VALIDATION_REQUIRED");
                  }
                  if (value < 1 || value > 65535) {
                    return t("settings:SETTINGS_VALIDATION_REQUIRED");
                  }
                  return true;
                },
              }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_PORT")}
                  </div>
                  <NumberInput
                    value={field.value}
                    min={1}
                    max={65535}
                    onValueChange={field.onChange}
                    placeholder="587"
                  />
                  <FieldMessage message={mailPortError} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="mailUsername"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_USERNAME")}
                  </div>
                  <Input {...field} placeholder="username (optional)" autoComplete="off" />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="mailPassword"
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-footnote font-medium">
                      {t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD")}
                    </div>
                    <div className="text-caption text-label-secondary">
                      {hasMailPasswordSecret
                        ? t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_SET")
                        : t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_NOT_SET")}
                    </div>
                  </div>
                  <PasswordInput
                    value={field.value || ""}
                    onChange={field.onChange}
                    autoComplete="new-password"
                    placeholder={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER")}
                  />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="mailFrom"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_FROM")}
                  </div>
                  <Input {...field} placeholder="noreply@example.com" />
                  <FieldMessage message={mailFromError} />
                </div>
              )}
            />

            <Controller
              control={form.control}
              name="mailFromName"
              rules={{ required: t("settings:SETTINGS_VALIDATION_REQUIRED") }}
              render={({ field }) => (
                <div className="space-y-2">
                  <div className="text-footnote font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}
                  </div>
                  <Input {...field} placeholder="Arclayer" />
                  <FieldMessage message={mailFromNameError} />
                </div>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <Controller
                control={form.control}
                name="mailStarttls"
                render={({ field }) => (
                  <div className="space-y-2">
                    <div className="text-footnote font-medium">
                      {t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS")}
                    </div>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </div>
                )}
              />

              <Controller
                control={form.control}
                name="mailSslTls"
                render={({ field }) => (
                  <div className="space-y-2">
                    <div className="text-footnote font-medium">
                      {t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}
                    </div>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </div>
                )}
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-footnote font-semibold">
                {t("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")}
              </div>
              <div className="mt-1 text-footnote text-label-secondary">
                {t("settings:SETTINGS_MESSAGING_MAIL_TEST_DESC")}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <Input
                  value={testRecipient}
                  onChange={(event) => setTestRecipient(event.target.value)}
                  placeholder={t("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER")}
                  autoComplete="off"
                />
                <Button
                  type="button"
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
                      .catch((error) => notifyError(error))
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
    form,
    hasMailPasswordSecret,
    isResettingMailConfig,
    isSavingMailConfig,
    isTestingEmail,
    mailEnabled,
    resetMailConfig,
    saveMailConfig,
    t,
    testRecipient,
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
        <div className="divide-y rounded-xl bg-background">
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
                disabled={disabled || isTogglingMailEnabled}
                onCheckedChange={(checked) => void setMailEnabled(Boolean(checked))}
                onClick={(event) => event.stopPropagation()}
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
                  resetText={t("settings:SETTINGS_RESET")}
                  resetLoading={isResettingMailTemplates}
                  disabled={disabled}
                >
                  <div className="flex w-full flex-col gap-2">
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={(mailEnabledTemplates || []).includes("registration_prompt")}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...(mailEnabledTemplates || []), "registration_prompt"]
                            : (mailEnabledTemplates || []).filter(
                                (value) => value !== "registration_prompt",
                              );
                          form.setValue("mailEnabledTemplates", next, { shouldDirty: true });
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex flex-col">
                        <div className="font-medium">
                          {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC")}
                        </div>
                      </div>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox
                        checked={(mailEnabledTemplates || []).includes("welcome_email")}
                        onCheckedChange={(checked) => {
                          const next = checked
                            ? [...(mailEnabledTemplates || []), "welcome_email"]
                            : (mailEnabledTemplates || []).filter(
                                (value) => value !== "welcome_email",
                              );
                          form.setValue("mailEnabledTemplates", next, { shouldDirty: true });
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex flex-col">
                        <div className="font-medium">
                          {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE")}
                        </div>
                        <div className="text-label-secondary">
                          {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC")}
                        </div>
                      </div>
                    </label>
                  </div>
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
        <div className="divide-y rounded-xl bg-background">
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
              resetText={t("settings:SETTINGS_RESET")}
              resetLoading={isResettingNotificationTypes}
              disabled={disabled}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={Boolean(inviteNotificationsEnabled)}
                  onCheckedChange={(value) =>
                    form.setValue("notificationInviteEnabled", Boolean(value), {
                      shouldDirty: true,
                    })
                  }
                  className="mt-0.5"
                />
                <div className="flex flex-col">
                  <div className="font-medium">
                    {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")}
                  </div>
                  <div className="text-label-secondary">
                    {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_DESC")}
                  </div>
                </div>
              </label>
            </SettingAccordionItem>
          </Accordion>
        </div>
      </SettingPanel>

      {overlays.renderOverlays()}
    </div>
  );
}
