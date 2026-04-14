import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SettingActionGroup } from "@arclayer/ui/setting-action-group";
import { Textarea } from "@arclayer/ui/textarea";
import { SettingActionItem } from "@arclayer/ui/setting-action-item";
import { SettingOverlayFooter } from "@arclayer/ui/setting-overlay-footer";
import { SettingPanel } from "@arclayer/ui/setting-panel";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { type SettingOverlayConfig, useSettingOverlays } from "@/hooks/use-setting-overlays";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readStringArrayValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  OverlayField,
  OverlayBooleanField,
  joinLineList,
  joinSummaryParts,
  splitLineList,
} from "@/pages/system/system-settings-form-utils";
import { SystemSettingsStatusBadge } from "@/pages/system/system-settings-primitives";

type AccessFormValues = {
  oauthAutoProvisionEnabled: boolean;
  oauthAutoAcceptEmailInvites: boolean;
  publicRegisterEnabled: boolean;
  publicRegisterRequireEmail: boolean;
  publicRegisterEmailDomainsAllowlist: string;
};

type AccessOverlayKey = "provisioning" | "registration";

function buildInitialValues(
  input: ReturnType<typeof useSystemCoreSettings>["coreSettings"],
): AccessFormValues {
  const provisioning = getSystemSettingsSection(input, "oauth_provisioning");
  const auth = getSystemSettingsSection(input, "auth");

  return {
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

export function SystemSettingsAccessPage() {
  const { t } = useTranslation(["settings"]);
  const { savingKey, withSavingKey } = useSavingKey();
  const coreSettingsQuery = useSystemCoreSettings();
  const patchMutation = usePatchSystemCoreSettings();

  const initialValues = useMemo(
    () => buildInitialValues(coreSettingsQuery.coreSettings),
    [coreSettingsQuery.coreSettings],
  );

  const form = useForm<AccessFormValues>({
    defaultValues: initialValues,
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: AccessFormValues) => {
    try {
      await patchMutation.mutateAsync(patch);
      form.reset(nextValues);
      notifySuccessText(t("settings:SETTINGS_SAVED"));
    } catch (error) {
      notifyError(error);
      throw error;
    }
  };

  const saveProvisioning = () =>
    withSavingKey("access.provisioning", async () => {
      const nextValues = {
        ...form.getValues(),
        oauthAutoProvisionEnabled: Boolean(form.getValues("oauthAutoProvisionEnabled")),
        oauthAutoAcceptEmailInvites: Boolean(form.getValues("oauthAutoAcceptEmailInvites")),
      };
      await persistPatch(
        {
          oauth_provisioning: {
            auto_provision_enabled: nextValues.oauthAutoProvisionEnabled,
            auto_accept_email_invites: nextValues.oauthAutoAcceptEmailInvites,
          },
        },
        nextValues,
      );
    });

  const saveRegistration = () =>
    withSavingKey("access.registration", async () => {
      const nextAllowlist = splitLineList(form.getValues("publicRegisterEmailDomainsAllowlist"));
      const nextValues = {
        ...form.getValues(),
        publicRegisterEnabled: Boolean(form.getValues("publicRegisterEnabled")),
        publicRegisterRequireEmail: Boolean(form.getValues("publicRegisterRequireEmail")),
        publicRegisterEmailDomainsAllowlist: nextAllowlist.join("\n"),
      };
      await persistPatch(
        {
          auth: {
            public_register_enabled: nextValues.publicRegisterEnabled,
            public_register_require_email: nextValues.publicRegisterRequireEmail,
            public_register_email_domains_allowlist: nextAllowlist,
          },
        },
        nextValues,
      );
    });

  const overlayConfigs = useMemo<readonly SettingOverlayConfig<AccessOverlayKey>[]>(() => {
    return [
      {
        key: "provisioning",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "access.provisioning"}
            disabled={patchMutation.isPending}
            onSave={saveProvisioning}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <Controller
              control={form.control}
              name="oauthAutoProvisionEnabled"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_DESC")}
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
              name="oauthAutoAcceptEmailInvites"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                  stateLabel={
                    field.value ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")
                  }
                />
              )}
            />
          </div>
        ),
      },
      {
        key: "registration",
        type: "dialog",
        title: t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_TITLE"),
        description: t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_DESC"),
        footer: (ctx) => (
          <SettingOverlayFooter
            close={ctx.close}
            backText={t("common:CANCEL")}
            saveText={t("settings:SETTINGS_SAVE")}
            saveLoading={savingKey === "access.registration"}
            disabled={patchMutation.isPending}
            onSave={saveRegistration}
          />
        ),
        content: () => (
          <div className="space-y-5">
            <Controller
              control={form.control}
              name="publicRegisterEnabled"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_DESC")}
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
              name="publicRegisterRequireEmail"
              render={({ field }) => (
                <OverlayBooleanField
                  label={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_TITLE")}
                  description={t(
                    "settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_DESC",
                  )}
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
        ),
      },
    ] as const;
  }, [form.control, patchMutation.isPending, saveProvisioning, saveRegistration, savingKey, t]);

  const overlays = useSettingOverlays(overlayConfigs);
  const openOverlay = (key: AccessOverlayKey) => {
    form.reset(initialValues);
    overlays.open(key);
  };
  const oauthAutoProvisionEnabled = initialValues.oauthAutoProvisionEnabled;
  const oauthAutoAcceptEmailInvites = initialValues.oauthAutoAcceptEmailInvites;
  const publicRegisterEnabled = initialValues.publicRegisterEnabled;
  const publicRegisterRequireEmail = initialValues.publicRegisterRequireEmail;
  const allowlist = splitLineList(initialValues.publicRegisterEmailDomainsAllowlist);
  const provisioningSummary = joinSummaryParts(
    [
      oauthAutoProvisionEnabled ? t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_TITLE") : null,
      oauthAutoAcceptEmailInvites
        ? t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_TITLE")
        : null,
    ],
    t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_EMPTY"),
  );
  const registrationSummary = joinSummaryParts(
    [
      publicRegisterEnabled
        ? t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_TITLE")
        : null,
      publicRegisterRequireEmail
        ? t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_TITLE")
        : null,
      allowlist.length > 0
        ? t("settings:SETTINGS_SYSTEM_ACCESS_ALLOWLIST_COUNT", { count: allowlist.length })
        : null,
    ],
    t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_EMPTY"),
  );

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SettingPanel
        title={t("settings:SETTINGS_SYSTEM_ACCESS_PAGE_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_ACCESS_PAGE_DESC")}
        bordered={false}
      >
        <SettingActionGroup>
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_TITLE")}
            summary={provisioningSummary}
            description={t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_DESC")}
            right={
              <SystemSettingsStatusBadge
                tone={
                  oauthAutoProvisionEnabled || oauthAutoAcceptEmailInvites ? "success" : "default"
                }
              >
                {oauthAutoProvisionEnabled || oauthAutoAcceptEmailInvites
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
            onTrigger={() => openOverlay("provisioning")}
          />
          <SettingActionItem
            title={t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_TITLE")}
            summary={registrationSummary}
            description={t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_DESC")}
            right={
              <SystemSettingsStatusBadge
                tone={
                  publicRegisterEnabled
                    ? "success"
                    : publicRegisterRequireEmail
                      ? "warning"
                      : "default"
                }
              >
                {publicRegisterEnabled
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
            onTrigger={() => openOverlay("registration")}
          />
        </SettingActionGroup>
      </SettingPanel>

      {overlays.renderOverlays()}
    </ContentGuard>
  );
}
