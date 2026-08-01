import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveSettingsNavItems } from "@/constants/menu/settings";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useWorkspaceRolesAccess } from "@/hooks/use-workspace-roles-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { SettingsFrame } from "@/pages/settings/settings-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Button } from "@arclayer/ui/button";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";

export function SettingsScreenHost() {
  const { t } = useTranslation("team");
  const settingsScreen = useSettingsScreen();
  const isOpen = settingsScreen.state.open;
  const activeScreen = settingsScreen.state.screen;
  const activeItem = getUsercenterOverlayItem(activeScreen);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const lastWorkspaceId = useWorkspaceStore((state) => state.lastWorkspaceId);
  const workspaceId = currentWorkspaceId ?? lastWorkspaceId;
  const rolesAccess = useWorkspaceRolesAccess(workspaceId ?? null);
  const settingsNavItems = resolveSettingsNavItems(rolesAccess.status);
  const [workspaceRoleCreateOpen, setWorkspaceRoleCreateOpen] = useState(false);

  useEffect(() => {
    if (!settingsScreen.state.open) return;
    if (activeScreen === "workspace.roles" && settingsScreen.state.section === "create-role") {
      setWorkspaceRoleCreateOpen(true);
    }
  }, [activeScreen, settingsScreen.state.open, settingsScreen.state.section]);

  useEffect(() => {
    if (!isOpen || activeScreen !== "workspace.roles") return;
    if (rolesAccess.status !== "unavailable") return;
    settingsScreen.switchSettingsScreen("workspace.plan-usage");
  }, [activeScreen, isOpen, rolesAccess.status, settingsScreen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) settingsScreen.closeSettings();
    },
    [settingsScreen],
  );

  const action = !isOpen ? undefined : activeScreen === "workspace.roles" &&
    rolesAccess.status === "available" ? (
    <Button onClick={() => setWorkspaceRoleCreateOpen(true)}>
      <Plus size={16} />
      {t("TEAM_ROLES_ADD_ROLE")}
    </Button>
  ) : undefined;
  const renderedContent = !isOpen ? null : activeScreen === "workspace.roles" &&
    rolesAccess.status === "available" ? (
    <TeamRolesPage
      workspaceIdOverride={workspaceId ?? null}
      createOpen={workspaceRoleCreateOpen}
      onCreateOpenChange={setWorkspaceRoleCreateOpen}
      embedded
    />
  ) : activeScreen === "workspace.roles" ? (
    <ContentGuard
      loading={rolesAccess.status === "loading"}
      error={rolesAccess.status === "error" ? rolesAccess.error : null}
      onRetry={() => void rolesAccess.refetch()}
      container="raw"
      loadingVariant="form"
    >
      <div />
    </ContentGuard>
  ) : (
    activeItem.render({
      targetSection: settingsScreen.state.section,
      payload: settingsScreen.state.payload,
      focusRequestId: settingsScreen.state.focusRequestId,
    })
  );

  return (
    <ExpandableScreen
      expanded={isOpen}
      onExpandChange={handleOpenChange}
      layoutId="global-usercenter-overlay"
    >
      <ExpandableScreenContent
        showCloseButton={false}
        className="border border-border/80 bg-background shadow-2xl"
      >
        <SettingsFrame
          activeScreen={activeScreen}
          items={settingsNavItems}
          action={action}
          onClose={() => handleOpenChange(false)}
          onSelectItem={(item) =>
            settingsScreen.switchSettingsScreen(
              item.screen === "workspace.roles" && rolesAccess.status === "unavailable"
                ? "workspace.plan-usage"
                : item.screen,
            )
          }
          className="h-full w-full max-w-none rounded-none border-0 shadow-none"
        >
          {renderedContent}
        </SettingsFrame>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export const UsercenterOverlayHost = SettingsScreenHost;
