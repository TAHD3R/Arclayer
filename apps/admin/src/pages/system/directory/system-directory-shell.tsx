import type { ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { ForbiddenView } from "@/components/builtin/forbidden-page";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from "@arclayer/ui/chrome-tabs";

type DirectoryTabKey = "users" | "workspaces" | "projects";

type DirectoryTabRoute = {
  key: DirectoryTabKey;
  labelKey: string;
  to: "/system/tenants/users" | "/system/tenants/workspaces" | "/system/tenants/projects";
};

const DIRECTORY_TAB_ROUTES: readonly DirectoryTabRoute[] = [
  {
    key: "users",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_USERS",
    to: "/system/tenants/users",
  },
  {
    key: "workspaces",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_WORKSPACES",
    to: "/system/tenants/workspaces",
  },
  {
    key: "projects",
    labelKey: "settings:SETTINGS_SYSTEM_DIRECTORY_TAB_PROJECTS",
    to: "/system/tenants/projects",
  },
] as const;

function resolveDirectoryTab(pathname: string): DirectoryTabKey {
  if (pathname.startsWith("/system/tenants/workspaces")) return "workspaces";
  if (pathname.startsWith("/system/tenants/projects")) return "projects";
  return "users";
}

export function SystemDirectoryShell(props: { children: ReactNode }) {
  const { t } = useTranslation(["settings"]);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const currentUserQuery = useCurrentUserProfile();
  const activeTab = resolveDirectoryTab(pathname);

  if (currentUserQuery.isLoading && !currentUserQuery.profile) {
    return (
      <DefaultPage title={t("settings:SETTINGS_SYSTEM_DIRECTORY_TITLE")} showFavoriteToggle={false}>
        <ContentGuard loading loadingVariant="form" />
      </DefaultPage>
    );
  }

  if (currentUserQuery.isError) {
    return (
      <DefaultPage title={t("settings:SETTINGS_SYSTEM_DIRECTORY_TITLE")} showFavoriteToggle={false}>
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
        const target = DIRECTORY_TAB_ROUTES.find((item) => item.key === next);
        if (!target) return;
        void navigate({ to: target.to });
      }}
    >
      <DefaultPage
        title={t("settings:SETTINGS_SYSTEM_DIRECTORY_TITLE")}
        showFavoriteToggle={false}
        contentContainerClassName="min-w-0"
        extra={
          <ChromeTabsList>
            {DIRECTORY_TAB_ROUTES.map((item) => (
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
