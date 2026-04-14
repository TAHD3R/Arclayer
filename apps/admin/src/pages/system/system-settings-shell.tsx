import type { ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ForbiddenView } from "@/components/builtin/forbidden-page";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";

type SystemNavKey = "overview" | "storage" | "email" | "oauth";

type SystemNavRoute = {
  key: SystemNavKey;
  labelKey: string;
  to: "/system" | "/system/storage" | "/system/email" | "/system/oauth";
};

const SYSTEM_NAV_ROUTES: readonly SystemNavRoute[] = [
  {
    key: "overview",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_OVERVIEW",
    to: "/system",
  },
  {
    key: "storage",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_STORAGE",
    to: "/system/storage",
  },
  {
    key: "email",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_EMAIL",
    to: "/system/email",
  },
  {
    key: "oauth",
    labelKey: "settings:SETTINGS_SYSTEM_NAV_OAUTH",
    to: "/system/oauth",
  },
] as const;

function resolveSystemNavKey(pathname: string): SystemNavKey {
  if (pathname.startsWith("/system/storage")) return "storage";
  if (pathname.startsWith("/system/email")) return "email";
  if (pathname.startsWith("/system/oauth")) return "oauth";
  return "overview";
}

export function SystemSettingsShell(props: { children: ReactNode }) {
  const { t } = useTranslation(["settings"]);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentUserQuery = useCurrentUserProfile();
  const activeTab = resolveSystemNavKey(pathname);

  if (currentUserQuery.isLoading && !currentUserQuery.profile) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_SYSTEM_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DESC")}
        showFavoriteToggle={false}
      >
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (currentUserQuery.isError) {
    return (
      <DefaultPage
        title={t("settings:SETTINGS_SYSTEM_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DESC")}
        showFavoriteToggle={false}
      >
        <ContentGuard
          loading={false}
          error={currentUserQuery.error}
          onRetry={() => void currentUserQuery.refetch()}
        />
      </DefaultPage>
    );
  }

  if (!currentUserQuery.isSuperAdmin) {
    return <ForbiddenView variant="admin" />;
  }

  return (
    <ChromeTabs
      value={activeTab}
      onValueChange={(next) => {
        const target = SYSTEM_NAV_ROUTES.find((item) => item.key === next);
        if (!target) return;
        void navigate({ to: target.to });
      }}
    >
      <DefaultPage
        title={t("settings:SETTINGS_SYSTEM_TITLE")}
        description={t("settings:SETTINGS_SYSTEM_DESC")}
        showFavoriteToggle={false}
        contentContainerClassName="min-w-0"
        extra={
          <ChromeTabsList>
            {SYSTEM_NAV_ROUTES.map((item) => (
              <ChromeTabsTrigger key={item.key} value={item.key}>
                {t(item.labelKey)}
              </ChromeTabsTrigger>
            ))}
          </ChromeTabsList>
        }
      >
        <section className="min-w-0">{props.children}</section>
      </DefaultPage>
    </ChromeTabs>
  );
}
