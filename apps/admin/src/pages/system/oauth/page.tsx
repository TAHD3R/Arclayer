import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Input } from "@arclayer/ui/input";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  OverlayBooleanField,
  formatSummaryText,
  normalizeOptionalString,
} from "@/pages/system/system-settings-form-utils";
import { SystemSettingsStatusBadge } from "@/pages/system/system-settings-primitives";

type OAuthFormValues = {
  googleEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  githubEnabled: boolean;
  githubClientId: string;
  githubClientSecret: string;
};

type OAuthOverlayKey = "google" | "github";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): OAuthFormValues {
  const google = getSystemSettingsSection(input, "oauth_google");
  const github = getSystemSettingsSection(input, "oauth_github");

  return {
    googleEnabled: Boolean(readBooleanValue(google, "enabled")),
    googleClientId: readStringValue(google, "client_id") ?? "",
    googleClientSecret: "",
    githubEnabled: Boolean(readBooleanValue(github, "enabled")),
    githubClientId: readStringValue(github, "client_id") ?? "",
    githubClientSecret: "",
  };
}

function formatProviderSummary(enabled: boolean, configured: boolean, t: (key: string) => string) {
  if (!enabled) return t("settings:SETTINGS_DISABLED");
  return configured
    ? t("settings:SETTINGS_SYSTEM_CONFIGURED")
    : t("settings:SETTINGS_SYSTEM_INCOMPLETE");
}

export function SystemSettingsOAuthPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();
  const secrets = getSystemSettingsSecrets(coreSettingsQuery.coreSettings);
  const hasGoogleSecret = Boolean(secrets["oauth_google.client_secret"]);
  const hasGithubSecret = Boolean(secrets["oauth_github.client_secret"]);

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<OAuthFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: OAuthFormValues) => {
    try {
      await patchMutation.mutateAsync(patch);
      form.reset(nextValues);
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    } catch (error) {
      notifyError(error);
      throw error;
    }
  };

  const saveProvider = (provider: "google" | "github") =>
    withSavingKey(`oauth.${provider}`, async () => {
      const enabledName = provider === "google" ? "googleEnabled" : "githubEnabled";
      const clientIdName = provider === "google" ? "googleClientId" : "githubClientId";
      const clientSecretName = provider === "google" ? "googleClientSecret" : "githubClientSecret";
      const hasSecret = provider === "google" ? hasGoogleSecret : hasGithubSecret;
      const sectionKey = provider === "google" ? "oauth_google" : "oauth_github";
      const values = await validateFormFields(form, [enabledName, clientIdName, clientSecretName]);
      const enabled = Boolean(values[enabledName]);
      const clientId = String(values[clientIdName] || "").trim();
      const clientSecret = String(values[clientSecretName] || "").trim();

      if (enabled && !clientId) {
        form.setError(clientIdName, {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }
      if (enabled && !clientSecret && !hasSecret) {
        form.setError(clientSecretName, {
          type: "validate",
          message: t("settings:SETTINGS_VALIDATION_REQUIRED"),
        });
        throw new Error("FORM_VALIDATION_FAILED");
      }

      const patchValue: Record<string, unknown> = {
        enabled,
        client_id: normalizeOptionalString(clientId),
      };
      if (clientSecret) {
        patchValue.client_secret = clientSecret;
      }

      await persistPatch(
        { [sectionKey]: patchValue },
        {
          ...form.getValues(),
          [enabledName]: enabled,
          [clientIdName]: clientId,
          [clientSecretName]: "",
        },
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<OAuthOverlayKey>[]>(() => {
    const googleClientIdError = getFieldErrorMessage(form, "googleClientId");
    const googleClientSecretError = getFieldErrorMessage(form, "googleClientSecret");
    const githubClientIdError = getFieldErrorMessage(form, "githubClientId");
    const githubClientSecretError = getFieldErrorMessage(form, "githubClientSecret");

    return [
      {
        key: "google",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_OAUTH_GOOGLE_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "oauth.google"}
            disabled={patchMutation.isPending}
            onSave={() => saveProvider("google")}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <Controller
              control={form.control}
              name="googleEnabled"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_DESC")}
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
              name="googleClientId"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_ID_LABEL")}
                  message={googleClientIdError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="googleClientSecret"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_SECRET_LABEL")}
                  description={
                    hasGoogleSecret
                      ? t("settings:SETTINGS_SYSTEM_OAUTH_SECRET_SET_HINT")
                      : t("settings:SETTINGS_SYSTEM_OAUTH_SECRET_EMPTY_HINT")
                  }
                  message={googleClientSecretError}
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
          </div>
        ),
      },
      {
        key: "github",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_OAUTH_GITHUB_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_DIALOG_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "oauth.github"}
            disabled={patchMutation.isPending}
            onSave={() => saveProvider("github")}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <Controller
              control={form.control}
              name="githubEnabled"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_DESC")}
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
              name="githubClientId"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_ID_LABEL")}
                  message={githubClientIdError}
                >
                  <Input {...field} autoComplete="off" />
                </OverlayField>
              )}
            />
            <Controller
              control={form.control}
              name="githubClientSecret"
              render={({ field }) => (
                <OverlayField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_CLIENT_SECRET_LABEL")}
                  description={
                    hasGithubSecret
                      ? t("settings:SETTINGS_SYSTEM_OAUTH_SECRET_SET_HINT")
                      : t("settings:SETTINGS_SYSTEM_OAUTH_SECRET_EMPTY_HINT")
                  }
                  message={githubClientSecretError}
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
          </div>
        ),
      },
    ] as const;
  }, [form, hasGithubSecret, hasGoogleSecret, patchMutation.isPending, saveProvider, savingKey, t]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: OAuthOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const googleEnabled = initialValues.googleEnabled;
  const googleClientId = initialValues.googleClientId;
  const githubEnabled = initialValues.githubEnabled;
  const githubClientId = initialValues.githubClientId;
  const googleConfigured = Boolean(googleClientId.trim() && hasGoogleSecret);
  const githubConfigured = Boolean(githubClientId.trim() && hasGithubSecret);

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SettingPanel
        title={t("settings:SETTINGS_SYSTEM_OAUTH_PAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_OAUTH_PAGE_DESC")}
        bordered={false}
      >
        <SettingActionGroup>
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_OAUTH_GOOGLE_TITLE")}
            summary={formatProviderSummary(googleEnabled, googleConfigured, t)}
            description={formatSummaryText(
              googleClientId,
              t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED"),
            )}
            right={
              <SystemSettingsStatusBadge
                tone={googleConfigured ? "success" : googleEnabled ? "warning" : "default"}
              >
                {googleEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
            onTrigger={() => openOverlay("google")}
          />
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_OAUTH_GITHUB_TITLE")}
            summary={formatProviderSummary(githubEnabled, githubConfigured, t)}
            description={formatSummaryText(
              githubClientId,
              t("settings:SETTINGS_SYSTEM_NOT_CONFIGURED"),
            )}
            right={
              <SystemSettingsStatusBadge
                tone={githubConfigured ? "success" : githubEnabled ? "warning" : "default"}
              >
                {githubEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
            onTrigger={() => openOverlay("github")}
          />
        </SettingActionGroup>
      </SettingPanel>

      {overlays.renderOverlays()}
    </ContentGuard>
  );
}
