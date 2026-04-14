import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
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
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  OverlayBooleanField,
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
};

type EmailOverlayKey = "smtp";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): EmailFormValues {
  const mail = getSystemSettingsSection(input, "mail");

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
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "mail.config"}
            disabled={patchMutation.isPending}
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
                  <OverlayBooleanField
                    label={t("settings:SETTINGS_MESSAGING_MAIL_STARTTLS")}
                    description={t("settings:SETTINGS_SYSTEM_EMAIL_STARTTLS_HELP")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    stateLabel={
                      field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                    }
                  />
                )}
              />
              <Controller
                control={form.control}
                name="mailSslTls"
                render={({ field }) => (
                  <OverlayBooleanField
                    label={t("settings:SETTINGS_MESSAGING_MAIL_SSL_TLS")}
                    description={t("settings:SETTINGS_SYSTEM_EMAIL_SSL_TLS_HELP")}
                    checked={Boolean(field.value)}
                    onCheckedChange={field.onChange}
                    stateLabel={
                      field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                    }
                  />
                )}
              />
            </div>
          </div>
        ),
      },
    ] as const;
  }, [form, hasMailPasswordSecret, patchMutation.isPending, saveMailConfig, savingKey, t]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: EmailOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const mailEnabled = initialValues.mailEnabled;
  const mailServer = initialValues.mailServer;
  const mailPort = initialValues.mailPort;
  const mailFrom = initialValues.mailFrom;
  const mailStarttls = initialValues.mailStarttls;
  const mailSslTls = initialValues.mailSslTls;

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
          bordered={false}
        >
          <SettingActionGroup>
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
                  starttls: mailStarttls,
                  sslTls: mailSslTls,
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
              onTrigger={() => openOverlay("smtp")}
            />
          </SettingActionGroup>
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
