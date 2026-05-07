import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@arclayer/ui/checkbox";
import { Switch } from "@arclayer/ui/switch";
import { Textarea } from "@arclayer/ui/textarea";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifySuccessText } from "@/lib/notifications";
import {
  SystemSettingField,
  SystemSettingFooterActions,
  SystemSettingItem,
  SystemSettingRow,
  SystemSettingStack,
} from "@/pages/system/components/system-setting-item";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readStringArrayValue,
  usePatchSystemCoreSettings,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import { joinLineList, splitLineList } from "@/pages/system/system-settings-form-utils";

type AccessFormValues = {
  oauthAutoProvisionEnabled: boolean;
  oauthAutoAcceptEmailInvites: boolean;
  publicRegisterEnabled: boolean;
  publicRegisterRequireEmail: boolean;
  publicRegisterEmailDomainsAllowlist: string;
};

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

function SettingBooleanControl(props: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  variant?: "switch" | "checkbox";
}) {
  return (
    <SystemSettingRow
      title={props.title}
      description={props.description}
      control={
        props.variant === "checkbox" ? (
          <Checkbox
            checked={props.checked}
            onCheckedChange={(checked) => props.onCheckedChange(Boolean(checked))}
          />
        ) : (
          <Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
        )
      }
    />
  );
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
  const values = form.watch();
  const provisioningDirty =
    values.oauthAutoProvisionEnabled !== initialValues.oauthAutoProvisionEnabled ||
    values.oauthAutoAcceptEmailInvites !== initialValues.oauthAutoAcceptEmailInvites;
  const registrationDirty =
    values.publicRegisterEnabled !== initialValues.publicRegisterEnabled ||
    values.publicRegisterRequireEmail !== initialValues.publicRegisterRequireEmail ||
    values.publicRegisterEmailDomainsAllowlist !==
      initialValues.publicRegisterEmailDomainsAllowlist;

  useEffect(() => {
    if (!coreSettingsQuery.coreSettings) return;
    if (form.formState.isDirty) return;
    form.reset(initialValues);
  }, [coreSettingsQuery.coreSettings, form, initialValues]);

  const persistPatch = async (patch: Record<string, unknown>, nextValues: AccessFormValues) => {
    await patchMutation.mutateAsync(patch);
    form.reset(nextValues);
    notifySuccessText(t("settings:SETTINGS_SAVED"));
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

  return (
    <ContentGuard
      loading={coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings}
      error={coreSettingsQuery.error}
      onRetry={() => void coreSettingsQuery.refetch()}
    >
      <SystemSettingStack>
        <SystemSettingItem
          id="oauth-provisioning"
          title={t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_ACCESS_PROVISIONING_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={provisioningDirty}
              pending={savingKey === "access.provisioning" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  oauthAutoProvisionEnabled: initialValues.oauthAutoProvisionEnabled,
                  oauthAutoAcceptEmailInvites: initialValues.oauthAutoAcceptEmailInvites,
                })
              }
              onSave={() => void saveProvisioning()}
            />
          }
        >
          <div className="grid gap-3">
            <Controller
              control={form.control}
              name="oauthAutoProvisionEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_PROVISION_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="oauthAutoAcceptEmailInvites"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_AUTO_ACCEPT_INVITES_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </SystemSettingItem>

        <SystemSettingItem
          id="public-registration"
          title={t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_ACCESS_REGISTRATION_DESC")}
          footer={
            <SystemSettingFooterActions
              dirty={registrationDirty}
              pending={savingKey === "access.registration" || patchMutation.isPending}
              onReset={() =>
                form.reset({
                  ...form.getValues(),
                  publicRegisterEnabled: initialValues.publicRegisterEnabled,
                  publicRegisterRequireEmail: initialValues.publicRegisterRequireEmail,
                  publicRegisterEmailDomainsAllowlist:
                    initialValues.publicRegisterEmailDomainsAllowlist,
                })
              }
              onSave={() => void saveRegistration()}
            />
          }
        >
          <div className="grid gap-3">
            <Controller
              control={form.control}
              name="publicRegisterEnabled"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_TITLE")}
                  description={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_ENABLED_DESC")}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="publicRegisterRequireEmail"
              render={({ field }) => (
                <SettingBooleanControl
                  title={t("settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_TITLE")}
                  description={t(
                    "settings:SETTINGS_SYSTEM_OAUTH_PUBLIC_REGISTER_REQUIRE_EMAIL_DESC",
                  )}
                  checked={Boolean(field.value)}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Controller
              control={form.control}
              name="publicRegisterEmailDomainsAllowlist"
              render={({ field }) => (
                <SystemSettingField
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
                </SystemSettingField>
              )}
            />
          </div>
        </SystemSettingItem>
      </SystemSettingStack>
    </ContentGuard>
  );
}
