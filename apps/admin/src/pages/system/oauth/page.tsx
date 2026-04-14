import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Input } from "@arclayer/ui/input";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";
import { ComplexDialog } from "@arclayer/ui/complex-dialog";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getFieldErrorMessage, validateFormFields } from "@/lib/forms/rhf-form-helpers";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  getSystemSettingsSecrets,
  readBooleanValue,
  readStringArrayValue,
  readStringValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  formatSummaryText,
  joinLineList,
  joinSummaryParts,
  normalizeOptionalString,
  splitLineList,
} from "@/pages/system/system-settings-form-utils";
import { SystemSettingsStatusBadge } from "@/pages/system/system-settings-primitives";

type OAuthFormValues = {
  googleEnabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  githubEnabled: boolean;
  githubClientId: string;
  githubClientSecret: string;
  oauthAutoProvisionEnabled: boolean;
  oauthAutoAcceptEmailInvites: boolean;
  publicRegisterEnabled: boolean;
  publicRegisterRequireEmail: boolean;
  publicRegisterEmailDomainsAllowlist: string;
};

type OAuthOverlayKey = "google" | "github";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): OAuthFormValues {
  const google = getSystemSettingsSection(input, "oauth_google");
  const github = getSystemSettingsSection(input, "oauth_github");
  const provisioning = getSystemSettingsSection(input, "oauth_provisioning");
  const auth = getSystemSettingsSection(input, "auth");

  return {
    googleEnabled: Boolean(readBooleanValue(google, "enabled")),
    googleClientId: readStringValue(google, "client_id") ?? "",
    googleClientSecret: "",
    githubEnabled: Boolean(readBooleanValue(github, "enabled")),
    githubClientId: readStringValue(github, "client_id") ?? "",
    githubClientSecret: "",
    oauthAutoProvisionEnabled: Boolean(readBooleanValue(provisioning, "auto_provision_enabled")),
    oauthAutoAcceptEmailInvites: Boolean(
      readBooleanValue(provisioning, "auto_accept_email_invites"),
    ),
    publicRegisterEnabled: Boolean(readBooleanValue(auth, "public_register_enabled")),
    publicRegisterRequireEmail: Boolean(readBooleanValue(auth, "public_register_require_email")),
    publicRegisterEmailDomainsAllowlist: joinLineList(
      readStringArrayValue(auth, "public_register_email_domains_allowlist"),
    ),
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
  const [policyOpen, setPolicyOpen] = useState(false);
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

  const googleEnabled = form.watch("googleEnabled") ?? initialValues.googleEnabled;
  const googleClientId = form.watch("googleClientId") ?? initialValues.googleClientId;
  const githubEnabled = form.watch("githubEnabled") ?? initialValues.githubEnabled;
  const githubClientId = form.watch("githubClientId") ?? initialValues.githubClientId;
  const oauthAutoProvisionEnabled =
    form.watch("oauthAutoProvisionEnabled") ?? initialValues.oauthAutoProvisionEnabled;
  const oauthAutoAcceptEmailInvites =
    form.watch("oauthAutoAcceptEmailInvites") ?? initialValues.oauthAutoAcceptEmailInvites;
  const publicRegisterEnabled =
    form.watch("publicRegisterEnabled") ?? initialValues.publicRegisterEnabled;
  const publicRegisterRequireEmail =
    form.watch("publicRegisterRequireEmail") ?? initialValues.publicRegisterRequireEmail;

  const googleConfigured = Boolean(googleClientId.trim() && hasGoogleSecret);
  const githubConfigured = Boolean(githubClientId.trim() && hasGithubSecret);

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

  const resetProvider = (provider: "google" | "github") =>
    withSavingKey(`reset:oauth.${provider}`, async () => {
      const enabledName = provider === "google" ? "googleEnabled" : "githubEnabled";
      const clientIdName = provider === "google" ? "googleClientId" : "githubClientId";
      const clientSecretName = provider === "google" ? "googleClientSecret" : "githubClientSecret";
      const initialEnabled = initialValues[enabledName];
      const initialClientId = initialValues[clientIdName];
      const sectionKey = provider === "google" ? "oauth_google" : "oauth_github";

      await persistPatch(
        {
          [sectionKey]: {
            enabled: initialEnabled,
            client_id: normalizeOptionalString(initialClientId),
          },
        },
        {
          ...form.getValues(),
          [enabledName]: initialEnabled,
          [clientIdName]: initialClientId,
          [clientSecretName]: "",
        },
      );
    });

  const savePolicy = () =>
    withSavingKey("oauth.policy", async () => {
      const allowlist = splitLineList(form.getValues("publicRegisterEmailDomainsAllowlist"));
      await persistPatch(
        {
          oauth_provisioning: {
            auto_provision_enabled: Boolean(form.getValues("oauthAutoProvisionEnabled")),
            auto_accept_email_invites: Boolean(form.getValues("oauthAutoAcceptEmailInvites")),
          },
          auth: {
            public_register_enabled: Boolean(form.getValues("publicRegisterEnabled")),
            public_register_require_email: Boolean(form.getValues("publicRegisterRequireEmail")),
            public_register_email_domains_allowlist: allowlist,
          },
        },
        {
          ...form.getValues(),
          publicRegisterEmailDomainsAllowlist: allowlist.join("\n"),
          googleClientSecret: "",
          githubClientSecret: "",
        },
      );
    });

  const resetPolicy = () =>
    withSavingKey("reset:oauth.policy", async () => {
      await persistPatch(
        {
          oauth_provisioning: {
            auto_provision_enabled: initialValues.oauthAutoProvisionEnabled,
            auto_accept_email_invites: initialValues.oauthAutoAcceptEmailInvites,
          },
          auth: {
            public_register_enabled: initialValues.publicRegisterEnabled,
            public_register_require_email: initialValues.publicRegisterRequireEmail,
            public_register_email_domains_allowlist: splitLineList(
              initialValues.publicRegisterEmailDomainsAllowlist,
            ),
          },
        },
        {
          ...form.getValues(),
          oauthAutoProvisionEnabled: initialValues.oauthAutoProvisionEnabled,
          oauthAutoAcceptEmailInvites: initialValues.oauthAutoAcceptEmailInvites,
          publicRegisterEnabled: initialValues.publicRegisterEnabled,
          publicRegisterRequireEmail: initialValues.publicRegisterRequireEmail,
          publicRegisterEmailDomainsAllowlist: initialValues.publicRegisterEmailDomainsAllowlist,
          googleClientSecret: "",
          githubClientSecret: "",
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
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={savingKey === "reset:oauth.google"}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "oauth.google"}
            disabled={patchMutation.isPending}
            onReset={() => resetProvider("google")}
            onSave={() => saveProvider("google")}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <Controller
              control={form.control}
              name="googleEnabled"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_TITLE")}>
                  <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                    <div className="text-footnote text-label-secondary">
                      {t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_DESC")}
                    </div>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </div>
                </OverlayField>
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
            backText={t("common:BACK")}
            resetText={t("settings:SETTINGS_RESET")}
            resetVisible
            resetLoading={savingKey === "reset:oauth.github"}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "oauth.github"}
            disabled={patchMutation.isPending}
            onReset={() => resetProvider("github")}
            onSave={() => saveProvider("github")}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <Controller
              control={form.control}
              name="githubEnabled"
              render={({ field }) => (
                <OverlayField label={t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_TITLE")}>
                  <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                    <div className="text-footnote text-label-secondary">
                      {t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_ENABLED_DESC")}
                    </div>
                    <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                  </div>
                </OverlayField>
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
  }, [
    form,
    hasGithubSecret,
    hasGoogleSecret,
    patchMutation.isPending,
    resetProvider,
    saveProvider,
    savingKey,
    t,
  ]);

  const overlays = useSettingOverlays(overlayConfigs);
  const providerCount = Number(Boolean(googleEnabled)) + Number(Boolean(githubEnabled));
  const policySummary = joinSummaryParts(
    [
      oauthAutoProvisionEnabled ? t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_TITLE") : null,
      oauthAutoAcceptEmailInvites
        ? t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_TITLE")
        : null,
      publicRegisterEnabled
        ? t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_TITLE")
        : null,
      publicRegisterRequireEmail
        ? t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_TITLE")
        : null,
    ],
    t("settings:SETTINGS_SYSTEM_OAUTH_POLICY_EMPTY"),
  );

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <div className="space-y-8">
        <SettingPanel
          title={t("settings:SETTINGS_SYSTEM_OAUTH_PAGE_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_OAUTH_PAGE_DESC")}
        >
          <div className="divide-y overflow-hidden rounded-2xl border border-border bg-card">
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
              onTrigger={() => overlays.open("google")}
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
              onTrigger={() => overlays.open("github")}
            />
          </div>
        </SettingPanel>

        <SettingPanel
          title={t("settings:SETTINGS_SYSTEM_OAUTH_POLICY_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_OAUTH_POLICY_DESC")}
        >
          <div className="divide-y overflow-hidden rounded-2xl border border-border bg-card">
            <SettingActionItem
              title={t("settings:SETTINGS_SYSTEM_OAUTH_POLICY_ITEM_TITLE")}
              summary={
                providerCount > 0
                  ? t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_COUNT", { count: providerCount })
                  : t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_COUNT_ZERO")
              }
              description={policySummary}
              onTrigger={() => setPolicyOpen(true)}
            />
          </div>
        </SettingPanel>

        {overlays.renderOverlays()}

        <ComplexDialog
          open={policyOpen}
          onOpenChange={setPolicyOpen}
          size="lg"
          title={t("settings:SETTINGS_SYSTEM_OAUTH_POLICY_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_OAUTH_POLICY_DIALOG_DESC")}
          footer={
            <SettingOverlayFooter
              close={() => setPolicyOpen(false)}
              backText={t("common:BACK")}
              resetText={t("settings:SETTINGS_RESET")}
              resetVisible
              resetLoading={savingKey === "reset:oauth.policy"}
              saveText={t("settings:SETTINGS_SAVE")}
              saveLoading={savingKey === "oauth.policy"}
              disabled={patchMutation.isPending}
              onReset={resetPolicy}
              onSave={savePolicy}
            />
          }
        >
          <div className="space-y-8">
            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-title3 font-semibold">
                  {t("settings:SETTINGS_SYSTEM_OAUTH_PROVISIONING_SECTION_TITLE")}
                </h3>
                <p className="text-body text-label-secondary">
                  {t("settings:SETTINGS_SYSTEM_OAUTH_PROVISIONING_SECTION_DESC")}
                </p>
              </div>
              <Controller
                control={form.control}
                name="oauthAutoProvisionEnabled"
                render={({ field }) => (
                  <OverlayField label={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_TITLE")}>
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div className="text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_DESC")}
                      </div>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  </OverlayField>
                )}
              />
              <Controller
                control={form.control}
                name="oauthAutoAcceptEmailInvites"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_TITLE")}
                  >
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div className="text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_DESC")}
                      </div>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  </OverlayField>
                )}
              />
            </div>

            <div className="space-y-5">
              <div className="space-y-1">
                <h3 className="text-title3 font-semibold">
                  {t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_SECTION_TITLE")}
                </h3>
                <p className="text-body text-label-secondary">
                  {t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_SECTION_DESC")}
                </p>
              </div>
              <Controller
                control={form.control}
                name="publicRegisterEnabled"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_TITLE")}
                  >
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div className="text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_DESC")}
                      </div>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  </OverlayField>
                )}
              />
              <Controller
                control={form.control}
                name="publicRegisterRequireEmail"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_TITLE")}
                  >
                    <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                      <div className="text-footnote text-label-secondary">
                        {t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_DESC")}
                      </div>
                      <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} />
                    </div>
                  </OverlayField>
                )}
              />
              <Controller
                control={form.control}
                name="publicRegisterEmailDomainsAllowlist"
                render={({ field }) => (
                  <OverlayField
                    label={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ALLOWLIST_LABEL")}
                    description={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ALLOWLIST_DESC")}
                  >
                    <Textarea
                      {...field}
                      rows={6}
                      placeholder={t(
                        "settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ALLOWLIST_PLACEHOLDER",
                      )}
                    />
                  </OverlayField>
                )}
              />
            </div>
          </div>
        </ComplexDialog>
      </div>
    </ContentGuard>
  );
}
