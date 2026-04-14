import { useTranslation } from "react-i18next";
import { SettingPanel } from "@arclayer/ui/setting-panel";

import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import {
  getSystemSettingsSection,
  readBooleanValue,
  readStringValue,
  useSystemCoreSettings,
} from "@/pages/system/hooks/use-system-core-settings";
import {
  SystemSettingsField,
  SystemSettingsStatusBadge,
} from "@/pages/system/system-settings-primitives";

function resolveSetupTone(status: string | null) {
  if (status === "ready") return "success";
  if (status === "repair_required") return "warning";
  return "default";
}

export function SystemSettingsOverviewPage() {
  const { t } = useTranslation(["settings"]);
  const dateTime = useAdminDateTimeFormatter();
  const runtimeQuery = useSystemRuntime();
  const coreSettingsQuery = useSystemCoreSettings();

  const loading =
    (runtimeQuery.isLoading && !runtimeQuery.runtime) ||
    (coreSettingsQuery.isLoading && !coreSettingsQuery.coreSettings);
  const error = runtimeQuery.error ?? coreSettingsQuery.error;

  const storage = getSystemSettingsSection(coreSettingsQuery.coreSettings, "storage");
  const mail = getSystemSettingsSection(coreSettingsQuery.coreSettings, "mail");
  const oauthGoogle = getSystemSettingsSection(coreSettingsQuery.coreSettings, "oauth_google");
  const oauthGithub = getSystemSettingsSection(coreSettingsQuery.coreSettings, "oauth_github");
  const storageProvider = readStringValue(storage, "provider") ?? "local";
  const mailEnabled = Boolean(readBooleanValue(mail, "enabled"));
  const mailFrom = readStringValue(mail, "mail_from");
  const oauthEnabledCount =
    Number(Boolean(readBooleanValue(oauthGoogle, "enabled"))) +
    Number(Boolean(readBooleanValue(oauthGithub, "enabled")));
  const updatedAt = dateTime.formatDateTime(coreSettingsQuery.coreSettings?.updatedAt, {
    emptyValue: t("settings:SETTINGS_SYSTEM_NEVER_UPDATED"),
  });

  return (
    <ContentGuard
      loading={loading}
      error={error}
      onRetry={() => {
        void runtimeQuery.refetch();
        void coreSettingsQuery.refetch();
      }}
    >
      <div className="space-y-8">
        <SettingPanel
          title={t("settings:SETTINGS_SYSTEM_OVERVIEW_RUNTIME_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_OVERVIEW_RUNTIME_DESC")}
        >
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_OVERVIEW_SETUP_TITLE")}
            summary={t(
              `settings:SETTINGS_SYSTEM_SETUP_STATUS_${runtimeQuery.instanceSetupStatus ?? "UNKNOWN"}`,
            )}
            description={
              runtimeQuery.instanceSetupRepairReason ??
              t("settings:SETTINGS_SYSTEM_OVERVIEW_SETUP_HELP")
            }
            right={
              <SystemSettingsStatusBadge tone={resolveSetupTone(runtimeQuery.instanceSetupStatus)}>
                {t(
                  `settings:SETTINGS_SYSTEM_SETUP_STATUS_${runtimeQuery.instanceSetupStatus ?? "UNKNOWN"}`,
                )}
              </SystemSettingsStatusBadge>
            }
          />
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_OVERVIEW_DEPLOYMENT_TITLE")}
            summary={
              runtimeQuery.deploymentSettingsEnabled
                ? t("settings:SETTINGS_ENABLED")
                : t("settings:SETTINGS_DISABLED")
            }
            description={t("settings:SETTINGS_SYSTEM_OVERVIEW_DEPLOYMENT_DESC")}
            right={
              <SystemSettingsStatusBadge
                tone={runtimeQuery.deploymentSettingsEnabled ? "success" : "default"}
              >
                {runtimeQuery.deploymentSettingsEnabled
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
          />
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_OVERVIEW_REGISTER_TITLE")}
            summary={
              runtimeQuery.publicRegisterEnabled
                ? t("settings:SETTINGS_ENABLED")
                : t("settings:SETTINGS_DISABLED")
            }
            description={t("settings:SETTINGS_SYSTEM_OVERVIEW_REGISTER_DESC")}
            right={
              <SystemSettingsStatusBadge
                tone={runtimeQuery.publicRegisterEnabled ? "success" : "default"}
              >
                {runtimeQuery.publicRegisterEnabled
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
          />
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_OVERVIEW_PERSISTENCE_TITLE")}
            summary={updatedAt}
            description={t("settings:SETTINGS_SYSTEM_OVERVIEW_PERSISTENCE_DESC")}
          />
        </SettingPanel>

        <SettingPanel
          title={t("settings:SETTINGS_SYSTEM_OVERVIEW_DOMAINS_TITLE")}
          description={t("settings:SETTINGS_SYSTEM_OVERVIEW_DOMAINS_DESC")}
        >
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_NAV_STORAGE")}
            summary={
              storageProvider === "s3"
                ? t("settings:SETTINGS_STORAGE_PROVIDER_S3")
                : t("settings:SETTINGS_STORAGE_PROVIDER_LOCAL")
            }
            description={t("settings:SETTINGS_STORAGE_PROVIDER_DESC")}
          />
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_NAV_EMAIL")}
            summary={mailEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")}
            description={mailFrom ?? t("settings:SETTINGS_SYSTEM_EMAIL_NOT_CONFIGURED")}
            right={
              <SystemSettingsStatusBadge tone={mailEnabled ? "success" : "default"}>
                {mailEnabled ? t("settings:SETTINGS_ENABLED") : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
          />
          <SystemSettingsField
            title={t("settings:SETTINGS_SYSTEM_NAV_OAUTH")}
            summary={
              oauthEnabledCount > 0
                ? t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_COUNT", { count: oauthEnabledCount })
                : t("settings:SETTINGS_SYSTEM_OAUTH_PROVIDER_COUNT_ZERO")
            }
            description={t("settings:SETTINGS_SYSTEM_OVERVIEW_OAUTH_DESC")}
            right={
              <SystemSettingsStatusBadge tone={oauthEnabledCount > 0 ? "success" : "default"}>
                {oauthEnabledCount > 0
                  ? t("settings:SETTINGS_ENABLED")
                  : t("settings:SETTINGS_DISABLED")}
              </SystemSettingsStatusBadge>
            }
          />
        </SettingPanel>
      </div>
    </ContentGuard>
  );
}
