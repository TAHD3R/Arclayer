import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { USER_CENTER_NAV_ITEMS } from "@/constants/menu/usercenter";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { GLOBAL_NAV_ITEMS } from "@/constants/menu/global";
import { WORKSPACE_NAV_ITEMS } from "@/constants/menu/workspaces";
import { UserCenterTopbar } from "@/components/layout/usercenter-topbar";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import {
  attachSearchToNavItems,
  buildCommonFooterItems,
  extractWorkspaceBaseFromPath,
  mapWorkspaceNavItems,
} from "@/layouts/admin-scene-utils";
import { parseNotificationsSourceSearch } from "@/lib/routing/notifications-source";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { filterNavByScope } from "@/lib/filter-nav-by-scope";
import type { CommandScope } from "@/lib/command/command-types";

export function UserCenterLayout() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const systemRuntime = useSystemRuntime();
  const sourceSearch = useMemo(() => parseNotificationsSourceSearch(searchStr), [searchStr]);
  const footerItems = useMemo(() => buildCommonFooterItems(COMMON_FOOTER_NAV_ITEMS), []);
  const isInboxRoute = pathname === "/notifications" || pathname.startsWith("/notifications/");
  const workspaceSourceBase = useMemo(
    () => (sourceSearch.sourcePath ? extractWorkspaceBaseFromPath(sourceSearch.sourcePath) : null),
    [sourceSearch.sourcePath],
  );

  const workspaceSourceItems = useMemo(() => {
    if (!workspaceSourceBase || !systemRuntime.runtime) return [];
    const workspaceNav = mapWorkspaceNavItems(WORKSPACE_NAV_ITEMS, workspaceSourceBase);
    return filterNavByScope(workspaceNav, systemRuntime.runtime.deploymentMode).filter(
      (item) => item.position !== "footer",
    );
  }, [systemRuntime.runtime, workspaceSourceBase]);

  const accountItems = useMemo(
    () => attachSearchToNavItems(USER_CENTER_NAV_ITEMS, sourceSearch),
    [sourceSearch],
  );
  const shouldUseSourceNavigation = isInboxRoute && sourceSearch.sourceKind !== undefined;

  const mainItems = useMemo(() => {
    if (!shouldUseSourceNavigation) return accountItems;
    if (sourceSearch.sourceKind === "workspace") return workspaceSourceItems;
    if (sourceSearch.sourceKind === "global") return GLOBAL_NAV_ITEMS;
    if (sourceSearch.sourceKind === "account") return accountItems;
    return accountItems;
  }, [accountItems, shouldUseSourceNavigation, sourceSearch.sourceKind, workspaceSourceItems]);

  const backTarget = sourceSearch.sourcePath ?? "/workspaces";
  const commandScope = useMemo<CommandScope>(() => {
    if (!isInboxRoute) {
      return {
        kind: "none",
        pathname,
        workspaceId: null,
        organizationId: null,
      };
    }
    if (sourceSearch.sourceKind === "workspace" && workspaceSourceBase) {
      return {
        kind: "workspace",
        pathname: sourceSearch.sourcePath ?? pathname,
        workspaceId: workspaceSourceBase.replace("/w/", ""),
        organizationId: null,
      };
    }
    return {
      kind: "none",
      pathname: sourceSearch.sourcePath ?? pathname,
      workspaceId: null,
      organizationId: null,
    };
  }, [
    isInboxRoute,
    pathname,
    sourceSearch.sourceKind,
    sourceSearch.sourcePath,
    workspaceSourceBase,
  ]);

  return (
    <AdminSceneLayout
      notificationQueryScope="account-shell"
      renderTopbar={(topbar) => (
        <UserCenterTopbar
          navItems={mainItems}
          commandScope={commandScope}
          showCommandTrigger={isInboxRoute}
          backLabel={t("common:BACK")}
          onBack={() => void navigate({ to: backTarget as never })}
          {...topbar}
        />
      )}
      mainItems={mainItems}
      favoriteWorkspaceBase={shouldUseSourceNavigation ? workspaceSourceBase : null}
      footerItems={footerItems}
      sidebarCollapsible="none"
      sidebarPathnameOverride={shouldUseSourceNavigation ? sourceSearch.sourcePath : undefined}
    >
      <Outlet />
    </AdminSceneLayout>
  );
}
