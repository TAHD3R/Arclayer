import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { getMyOrganization } from "@/api/me";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import {
  ChromeTabs,
  ChromeTabsContent,
  ChromeTabsList,
  ChromeTabsTrigger,
} from "@/components/ui/chrome-tabs";
import { SettingActionItem } from "@/components/common/setting-action-item";
import { SettingPanel } from "@/components/common/setting-panel";
import { ApiError } from "@/lib/http";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { DeploymentSettingsTab } from "@/components/common/settings/organization/deployment-settings-tab";

type OrganizationSettingsTabKey =
  | "members_access"
  | "billing_assets"
  | "security_audit"
  | "developer"
  | "deployment";

function PlaceholderSection(props: {
  title: string;
  description: string;
  placeholderSummary: string;
  items: Array<{ title: string; summary?: string; description?: string | string[] }>;
}) {
  return (
    <SettingPanel title={props.title} description={props.description}>
      <div className="divide-y divide-border rounded-lg border border-border">
        {props.items.map((it) => (
          <SettingActionItem
            key={it.title}
            disabled
            title={it.title}
            summary={it.summary ?? props.placeholderSummary}
            description={it.description}
          />
        ))}
      </div>
    </SettingPanel>
  );
}

export function OrganizationSettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const runtime = useSystemRuntime();

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization"],
    queryFn: async () => getMyOrganization(),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";
  const showDeployment = runtime.deploymentSettingsEnabled;

  const forbiddenError = useMemo(
    () =>
      new ApiError({
        status: 403,
        message: t("common:PAGE_FORBIDDEN_DESC"),
        error: "ORG_ADMIN_REQUIRED",
      }),
    [t],
  );

  const tabs: Array<{ key: OrganizationSettingsTabKey; label: string }> = useMemo(() => {
    const base: Array<{ key: OrganizationSettingsTabKey; label: string }> = [
      { key: "members_access", label: t("settings:SETTINGS_ORG_TAB_MEMBERS_ACCESS") },
      { key: "billing_assets", label: t("settings:SETTINGS_ORG_TAB_BILLING_ASSETS") },
      { key: "security_audit", label: t("settings:SETTINGS_ORG_TAB_SECURITY_AUDIT") },
      { key: "developer", label: t("settings:SETTINGS_ORG_TAB_DEVELOPER") },
    ];
    if (showDeployment) {
      base.push({ key: "deployment", label: t("settings:SETTINGS_ORG_TAB_DEPLOYMENT") });
    }
    return base;
  }, [showDeployment, t]);

  const defaultTab: OrganizationSettingsTabKey = tabs[0]?.key ?? "members_access";

  if (myOrgQuery.isLoading && !myOrgQuery.data) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <PageState loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (myOrgQuery.isError) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <PageState
          loading={false}
          error={myOrgQuery.error}
          onRetry={() => void myOrgQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!canManageOrganization) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_ORG_TITLE")}
        description={t("settings:SETTINGS_ORG_DESC")}
        width="fixed"
      >
        <PageState loading={false} error={forbiddenError} hideRetry />
      </DefaultPage>
    );
  }

  return (
    <DefaultPage
      title={t("settings:SETTINGS_ORG_TITLE")}
      description={t("settings:SETTINGS_ORG_DESC")}
      width="fixed"
    >
      <ChromeTabs defaultValue={defaultTab}>
        <ChromeTabsList>
          {tabs.map((tab) => (
            <ChromeTabsTrigger key={tab.key} value={tab.key}>
              {tab.label}
            </ChromeTabsTrigger>
          ))}
        </ChromeTabsList>

        <ChromeTabsContent value="members_access">
          <PlaceholderSection
            title={t("settings:SETTINGS_ORG_MEMBERS_ACCESS_TITLE")}
            description={t("settings:SETTINGS_ORG_MEMBERS_ACCESS_DESC")}
            placeholderSummary={t("common:PAGE_COMING_SOON")}
            items={[
              {
                title: t("settings:SETTINGS_ORG_MEMBERS_DIRECTORY_TITLE"),
                description: t("settings:SETTINGS_ORG_MEMBERS_DIRECTORY_DESC"),
              },
              {
                title: t("settings:SETTINGS_ORG_ROLES_TITLE"),
                description: t("settings:SETTINGS_ORG_ROLES_DESC"),
              },
            ]}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="billing_assets">
          <PlaceholderSection
            title={t("settings:SETTINGS_ORG_BILLING_ASSETS_TITLE")}
            description={t("settings:SETTINGS_ORG_BILLING_ASSETS_DESC")}
            placeholderSummary={t("common:PAGE_COMING_SOON")}
            items={[
              {
                title: t("settings:SETTINGS_ORG_BILLING_TITLE"),
                description: t("settings:SETTINGS_ORG_BILLING_DESC"),
              },
              {
                title: t("settings:SETTINGS_ORG_BRANDING_TITLE"),
                description: t("settings:SETTINGS_ORG_BRANDING_DESC"),
              },
            ]}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="security_audit">
          <PlaceholderSection
            title={t("settings:SETTINGS_ORG_SECURITY_AUDIT_TITLE")}
            description={t("settings:SETTINGS_ORG_SECURITY_AUDIT_DESC")}
            placeholderSummary={t("common:PAGE_COMING_SOON")}
            items={[
              {
                title: t("settings:SETTINGS_ORG_SSO_TITLE"),
                description: t("settings:SETTINGS_ORG_SSO_DESC"),
              },
              {
                title: t("settings:SETTINGS_ORG_ACTIVITY_TITLE"),
                description: t("settings:SETTINGS_ORG_ACTIVITY_DESC"),
              },
            ]}
          />
        </ChromeTabsContent>

        <ChromeTabsContent value="developer">
          <PlaceholderSection
            title={t("settings:SETTINGS_ORG_DEVELOPER_TITLE")}
            description={t("settings:SETTINGS_ORG_DEVELOPER_DESC")}
            placeholderSummary={t("common:PAGE_COMING_SOON")}
            items={[
              {
                title: t("settings:SETTINGS_ORG_API_KEYS_TITLE"),
                description: t("settings:SETTINGS_ORG_API_KEYS_DESC"),
              },
              {
                title: t("settings:SETTINGS_ORG_WEBHOOKS_TITLE"),
                description: t("settings:SETTINGS_ORG_WEBHOOKS_DESC"),
              },
            ]}
          />
        </ChromeTabsContent>

        {showDeployment ? (
          <ChromeTabsContent value="deployment">
            <DeploymentSettingsTab />
          </ChromeTabsContent>
        ) : null}
      </ChromeTabs>
    </DefaultPage>
  );
}
