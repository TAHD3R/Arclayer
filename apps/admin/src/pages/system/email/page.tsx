import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Input } from "@arclayer/ui/input";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { Switch } from "@arclayer/ui/switch";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { sendTestEmail } from "@/api/mail";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readNumberValue,
  readRecordValue,
  readStringArrayValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  joinSummaryParts,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";
import { SystemSettingsStatusBadge } from "@/pages/system/system-settings-primitives";

type EmailFormValues = {
  mailEnabled: boolean;
  mailServer: string;
  mailPort: string;
  mailUsername: string;
  mailPassword: string;
  mailFrom: string;
  mailFromName: string;
  mailStarttls: boolean;
  mailSslTls: boolean;
  mailEnabledTemplates: string[];
  notificationInviteEnabled: boolean;
};

type EmailOverlayKey = "smtp" | "policy";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): EmailFormValues {
  const mail = getSystemSettingsSection(input, "mail");
  const notifications = getSystemSettingsSection(input, "notifications");
  const preferences = readRecordValue(mail, "preferences");

  return {
    mailEnabled: Boolean(readBooleanValue(mail, "enabled")),
    mailServer: readStringValue(mail, "server") ?? "localhost",
    mailPort: String(readNumberValue(mail, "port") ?? 587),
    mailUsername: readStringValue(mail, "username") ?? "",
    mailPassword: "",
    mailFrom: readStringValue(mail, "mail_from") ?? "noreply@example.com",
    mailFromName: readStringValue(mail, "mail_from_name") ?? "Arclayer",
    mailStarttls: Boolean(readBooleanValue(mail, "starttls")),
    mailSslTls: Boolean(readBooleanValue(mail, "ssl_tls")),
    mailEnabledTemplates: readStringArrayValue(preferences, "enabled_templates"),
    notificationInviteEnabled: Boolean(readBooleanValue(notifications, "invite_enabled")),
  };
}

function formatTransportSummary(params: {
  starttls: boolean;
  sslTls: boolean;
  t: (key: string) => string;
}) {
  const parts: string[] = [];
  if (params.starttls) parts.push(params.t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS"));
  if (params.sslTls) parts.push(params.t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS"));
  return parts.length > 0
    ? parts.join(" / ")
    : params.t("settings:SETTINGS_SYSTEM_EMAIL_TRANSPORT_NONE");
}

export function SystemSettingsEmailPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const hasMailPasswordSecret = Boolean(secrets["mail.password"]);
  const [testRecipient, setTestRecipient] = useState("");
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<EmailFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const mailEnabled = form.watch("mailEnabled") ?? initialValues.mailEnabled;
  const mailServer = form.watch("mailServer") ?? initialValues.mailServer;
  const mailPort = form.watch("mailPort") ?? initialValues.mailPort;
  const mailFrom = form.watch("mailFrom") ?? initialValues.mailFrom;
  const mailEnabledTemplates =
    form.watch("mailEnabledTemplates") ?? initialValues.mailEnabledTemplates;
  const notificationInviteEnabled =
    form.watch("notificationInviteEnabled") ?? initialValues.notificationInviteEnabled;

  const persistPatch = async (patch: Record<string, unknown>, nextValues: EmailFormValues) => {
    try {
      await patchMutation.mutateAsync(patch);
      form.reset(nextValues);
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    } catch (error) {
      notifyError(error);
      throw error;
    }
  };

  const setMailEnabled = (next: boolean) =>
    withSavingKey("mail.enabled", async () => {
      await persistPatch(
        { mail: { enabled: next } },
        {
          ...form.getValues(),
          mailEnabled: next,
          mailPassword: "",
        },
      );
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
      const port = Number(values.mailPort || 0);
      if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        form.setError("mailPort", {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_PORT_INVALID"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const patchValue: Record<string, unknown> = {
        server: String(values.mailServer || "").trim() || "localhost",
        port,
        username: normalizeOptionalString(values.mailUsername),
        mail_from: String(values.mailFrom || "").trim() || "noreply@example.com",
        mail_from_name: String(values.mailFromName || "").trim() || "Arclayer",
        starttls: Boolean(values.mailStarttls),
        ssl_tls: Boolean(values.mailSslTls),
      };
      const password = String(values.mailPassword || "").trim();
      if (password) {
        patchValue.password = password;
      }

      await persistPatch(
        { mail: patchValue },
        {
          ...form.getValues(),
          mailServer: String(values.mailServer || "").trim() || "localhost",
          mailPort: String(port),
          mailUsername: String(values.mailUsername || "").trim(),
          mailPassword: "",
          mailFrom: String(values.mailFrom || "").trim() || "noreply@example.com",
          mailFromName: String(values.mailFromName || "").trim() || "Arclayer",
          mailStarttls: Boolean(values.mailStarttls),
          mailSslTls: Boolean(values.mailSslTls),
        },
      );
    });

  const resetMailConfig = () =>
    withSavingKey("reset:mail.config", async () => {
      await persistPatch(
        {
          mail: {
            server: initialValues.mailServer,
            port: Number(initialValues.mailPort || 587),
            username: normalizeOptionalString(initialValues.mailUsername),
            mail_from: initialValues.mailFrom,
            mail_from_name: initialValues.mailFromName,
            starttls: initialValues.mailStarttls,
            ssl_tls: initialValues.mailSslTls,
          },
        },
        {
          ...form.getValues(),
          mailServer: initialValues.mailServer,
          mailPort: initialValues.mailPort,
          mailUsername: initialValues.mailUsername,
          mailPassword: "",
          mailFrom: initialValues.mailFrom,
          mailFromName: initialValues.mailFromName,
          mailStarttls: initialValues.mailStarttls,
          mailSslTls: initialValues.mailSslTls,
        },
      );
    });

  const savePolicy = () =>
    withSavingKey("mail.policy", async () => {
      const nextTemplates = Array.from(new Set(form.getValues("mailEnabledTemplates") || []));
      const inviteEnabled = Boolean(form.getValues("notificationInviteEnabled"));
      await persistPatch(
        {
          mail: {
            preferences: {
              enabled_templates: nextTemplates,
            },
          },
          notifications: {
            invite_enabled: inviteEnabled,
          },
        },
        {
          ...form.getValues(),
          mailEnabledTemplates: nextTemplates,
          notificationInviteEnabled: inviteEnabled,
          mailPassword: "",
        },
      );
    });

  const resetPolicy = () =>
    withSavingKey("reset:mail.policy", async () => {
      await persistPatch(
        {
          mail: {
            preferences: {
              enabled_templates: initialValues.mailEnabledTemplates,
            },
          },
          notifications: {
            invite_enabled: initialValues.notificationInviteEnabled,
          },
        },
        {
          ...form.getValues(),
          mailEnabledTemplates: initialValues.mailEnabledTemplates,
          notificationInviteEnabled: initialValues.notificationInviteEnabled,
          mailPassword: "",
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<EmailOverlayKey>[]>(() => {
    const mailServerError = getFieldErrorMessage(form, "mailServer");
    const mailPortError = getFieldErrorMessage(form, "mailPort");
    const mailFromError = getFieldErrorMessage(form, "mailFrom");
    const mailFromNameError = getFieldErrorMessage(form, "mailFromName");

    return [
      {
        key: "smtp",
        type: "sheet",
        title: t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_TITLE"),
        description: t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_SHEET_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={savingKey === "reset:mail.config"}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.config"}
            disabled={patchMutation.isPending}
            onReset={resetMailConfig}
            onSave={saveMailConfig}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <div className="text-label-secondary">
              {t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_HELP")}
            </div>
            <Controller
              control={form.control}
              name="mailServer"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_SERVER")}
                  message={mailServerError}
                >
                  <Input {...field} placeholder="smtp.example.com" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailPort"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_PORT")}
                  message={mailPortError}
                >
                  <Input {...field} type="number" inputMode="numeric" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailUsername"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_USERNAME")}>
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailPassword"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD")}
                  description={
                    hasMailPasswordSecret
                      ? t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_SET")
                      : t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_SECRET_NOT_SET")
                  }
                >
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("settings:SETTINGS_MESSAGING_MAIL_PASSWORD_PLACEHOLDER")}
                  />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailFrom"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_FROM")}
                  message={mailFromError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="mailFromName"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_MESSAGING_MAIL_FROM_NAME")}
                  message={mailFromNameError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Controller
                control={form.control}
                name="mailStarttls"
                render={({ field }) => (
                  <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS")}>
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div className="text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_EMAIL_STARTTLS_HELP")}
                      </div>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  </OverlayField>
                )}
              />
              <Controller
                control={form.control}
                name="mailSslTls"
                render={({ field }) => (
                  <OverlayField label={t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}>
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div className="text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_EMAIL_SSL_TLS_HELP")}
                      </div>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  </OverlayField>
                )}
              />
            </div>
          </div>
        ),
      },
      {
        key: "policy",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_EMAIL_POLICY_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_EMAIL_POLICY_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={savingKey === "reset:mail.policy"}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.policy"}
            disabled={patchMutation.isPending}
            onReset={resetPolicy}
            onSave={savePolicy}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="text-footnote font-medium text-label-primary">
                {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATES_TITLE")}
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                <Checkbox
                  checked={mailEnabledTemplates.includes("registration_prompt")}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...mailEnabledTemplates, "registration_prompt"]
                      : mailEnabledTemplates.filter((value) => value !== "registration_prompt");
                    form.setValue("mailEnabledTemplates", Array.from(new Set(next)), {
                      shouldDirty: true,
                    });
                  }}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <div className="font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_TITLE")}
                  </div>
                  <div className="text-footnote text-label-secondary">
                    {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_REG_PROMPT_DESC")}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                <Checkbox
                  checked={mailEnabledTemplates.includes("welcome_email")}
                  onCheckedChange={(checked) => {
                    const next = checked
                      ? [...mailEnabledTemplates, "welcome_email"]
                      : mailEnabledTemplates.filter((value) => value !== "welcome_email");
                    form.setValue("mailEnabledTemplates", Array.from(new Set(next)), {
                      shouldDirty: true,
                    });
                  }}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <div className="font-medium">
                    {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_TITLE")}
                  </div>
                  <div className="text-footnote text-label-secondary">
                    {t("settings:SETTINGS_MESSAGING_MAIL_TEMPLATE_WELCOME_DESC")}
                  </div>
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <div className="text-footnote font-medium text-label-primary">
                {t("settings:SETTINGS_MESSAGING_NOTIFICATION_TYPES_TITLE")}
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                <Checkbox
                  checked={notificationInviteEnabled}
                  onCheckedChange={(checked) => {
                    form.setValue("notificationInviteEnabled", Boolean(checked), {
                      shouldDirty: true,
                    });
                  }}
                  className="mt-1"
                />
                <div className="space-y-1">
                  <div className="font-medium">
                    {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE")}
                  </div>
                  <div className="text-footnote text-label-secondary">
                    {t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_DESC")}
                  </div>
                </div>
              </label>
            </div>
          </div>
        ),
      },
    ] as const;
  }, [
    form,
    hasMailPasswordSecret,
    initialValues.mailEnabledTemplates,
    initialValues.notificationInviteEnabled,
    mailEnabledTemplates,
    notificationInviteEnabled,
    patchMutation.isPending,
    resetMailConfig,
    resetPolicy,
    saveMailConfig,
    savePolicy,
    savingKey,
    t,
  ]);

  const overlays = useSettingOverlays(overlayConfigs);
  const policySummary = joinSummaryParts(
    [
      mailEnabledTemplates.length > 0
        ? t("settings:SETTINGS_MESSAGING_SELECTED_COUNT", { count: mailEnabledTemplates.length })
        : null,
      notificationInviteEnabled ? t("settings:SETTINGS_MESSAGING_NOTIFICATION_INVITE_TITLE") : null,
    ],
    t("settings:SETTINGS_SYSTEM_EMAIL_POLICY_EMPTY"),
  );

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <div className="space-y-8">
        <SettingPanel
          title={t("settings:SETTINGS_SYSTEM_EMAIL_PAGE_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_EMAIL_PAGE_DESC")}
        >
          <div className="divide-y overflow-hidden rounded-2xl border border-border bg-card">
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_TITLE")}
              summary={
                mailEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
              }
              description={t("settings:SETTINGS_MESSAGING_MAIL_ENABLED_DESC")}
              right={
                <Switch
                  checked={mailEnabled}
                  disabled={patchMutation.isPending || savingKey === "mail.enabled"}
                  onCheckedChange={(checked) => {
                    void setMailEnabled(Boolean(checked));
                  }}
                />
              }
              showChevron={false}
              as="div"
            />
            <SettingActionItem
              title={t("settings:SETTINGS_MESSAGING_MAIL_CONFIG_TITLE")}
              summary={`${mailServer}:${mailPort}`}
              description={joinSummaryParts([
                mailFrom,
                formatTransportSummary({
                  starttls: Boolean(form.watch("mailStarttls")),
                  sslTls: Boolean(form.watch("mailSslTls")),
                  t,
                }),
              ])}
              right={
                <SystemSettingsStatusBadge tone={hasMailPasswordSecret ? "success" : "warning"}>
                  {hasMailPasswordSecret
                    ? t("settings:SETTINGS_SYSTEM_CONFIGURED")
                    : t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED")}
                </SystemSettingsStatusBadge>
              }
              onTrigger={() => overlays.open("smtp")}
            />
            <SettingActionItem
              title={t("settings:SETTINGS_SYSTEM_EMAIL_POLICY_TITLE")}
              summary={policySummary}
              description={t("settings:SETTINGS_SYSTEM_EMAIL_POLICY_DESC")}
              onTrigger={() => overlays.open("policy")}
            />
          </div>
        </SettingPanel>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <header className="space-y-1">
            <h2 className="text-title2 font-bold">
              {t("settings:SETTINGS_MESSAGING_MAIL_TEST_TITLE")}
            </h2>
            <p className="text-body text-label-secondary">
              {mailEnabled
                ? t("settings:SETTINGS_MESSAGING_MAIL_TEST_DESC")
                : t("settings:SETTINGS_SYSTEM_EMAIL_TEST_DISABLED_HINT")}
            </p>
          </header>

          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={testRecipient}
              onChange={(event) => setTestRecipient(event.target.value)}
              placeholder={t("settings:SETTINGS_MESSAGING_MAIL_TEST_PLACEHOLDER")}
              autoComplete="off"
            />
            <Button
              type="button"
              loading={isTestingEmail}
              disabled={!mailEnabled || !testRecipient.trim()}
              onClick={() => {
                const recipient = testRecipient.trim();
                if (!recipient) return;
                setIsTestingEmail(true);
                sendTestEmail({ recipient })
                  .then(() => notifySuccessText(t("settings:SETTINGS_MESSAGING_MAIL_TEST_SUCCESS")))
                  .catch((error) => notifyError(error))
                  .finally(() => setIsTestingEmail(false));
              }}
            >
              {t("settings:SETTINGS_MESSAGING_MAIL_TEST_ACTION")}
            </Button>
          </div>
        </section>

        {overlays.renderOverlays()}
      </div>
    </ContentGuard>
  );
}
