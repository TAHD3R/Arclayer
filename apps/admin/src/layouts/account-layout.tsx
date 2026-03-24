import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { ACCOUNT_NAV_ITEMS } from "@/constants/menu/account";
import { COMMON_FOOTER_NAV_ITEMS } from "@/constants/menu/common";
import { GLOBAL_NAV_ITEMS } from "@/constants/menu/global";
import { WORKSPACE_NAV_ITEMS } from "@/constants/menu/workspaces";
import { AccountTopbar } from "@/components/layout/account-topbar";
import { AdminSceneLayout } from "@/layouts/admin-scene-layout";
import {
  attachSearchToNavItems,
  buildCommonFooterItems,
  extractWorkspaceBaseFromPath,
  mapWorkspaceNavItems,
} from "@/layouts/admin-scene-utils";
import { validateInboxSourceSearch } from "@/lib/routing/inbox-source";
import { useSystemRuntime } from "@/hooks/use-system-runtime";
import { filterNavByScope } from "@/lib/filter-nav-by-scope";
import type { CommandScope } from "@/lib/command/command-types";

export function AccountLayout() {
  const { t } = useTranslation(["common"]);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rawSearch = useRouterState({
    select: (state) => (state.location.search as Record<string, unknown>) ?? {},
  });
  const systemRuntime = useSystemRuntime();
  const sourceSearch = useMemo(() => validateInboxSourceSearch(rawSearch), [rawSearch]);
  const footerItems = useMemo(() => buildCommonFooterItems(COMMON_FOOTER_NAV_ITEMS), []);
  const isMeRoute = pathname === "/me" || pathname.startsWith("/me/");
  const isInboxRoute = pathname === "/me/inbox" || pathname.startsWith("/me/inbox/");
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
    () => attachSearchToNavItems(ACCOUNT_NAV_ITEMS, sourceSearch),
    [sourceSearch],
  );

  const mainItems = useMemo(() => {
    if (!isMeRoute) return accountItems;
    if (sourceSearch.sourceKind === "workspace") return workspaceSourceItems;
    if (sourceSearch.sourceKind === "global") return GLOBAL_NAV_ITEMS;
    if (sourceSearch.sourceKind === "account") return accountItems;
    return [];
  }, [accountItems, isMeRoute, sourceSearch.sourceKind, workspaceSourceItems]);

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
        <AccountTopbar
          mode={isMeRoute ? "me" : "account"}
          navItems={mainItems}
          commandScope={commandScope}
          showCommandTrigger={isInboxRoute}
          backLabel={t("common:BACK")}
          onBack={() => void navigate({ to: backTarget as never })}
          {...topbar}
        />
      )}
      mainItems={mainItems}
      favoriteWorkspaceBase={isMeRoute ? workspaceSourceBase : null}
      footerItems={footerItems}
      sidebarCollapsible="none"
      sidebarPathnameOverride={isMeRoute ? sourceSearch.sourcePath : undefined}
    >
      <Outlet />
    </AdminSceneLayout>
  );
}
