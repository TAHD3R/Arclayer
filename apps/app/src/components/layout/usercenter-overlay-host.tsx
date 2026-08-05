import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { resolveSettingsNavItems } from "@/constants/menu/settings";
import { listMyWorkspaces } from "@/api/workspaces";
import {
  UserAvatar,
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
} from "@/components/common/entity-avatar";
import { useSettingsScreen } from "@/components/layout/settings-screen-provider";
import { useCurrentUserProfile } from "@/hooks/use-current-user-profile";
import {
  useWorkspaceRolesAccess,
  type WorkspaceRolesAccessStatus,
} from "@/hooks/use-workspace-roles-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { getUsercenterOverlayItem } from "@/pages/usercenter/shared/usercenter-overlay-registry";
import { SettingsFrame, type SettingsNavIdentityOverrides } from "@/pages/settings/settings-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Button } from "@arclayer/ui/button";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import { TeamRolesPage } from "@/pages/workspaces/team/roles/page";

function WorkspaceRolesGate(props: {
  workspaceId: string | null;
  status: WorkspaceRolesAccessStatus;
  error: unknown;
  onRetry: () => void;
  onOpenPlanUsage: () => void;
}) {
  const { t } = useTranslation(["account", "errors", "settings", "workspaceAccess"]);

  if (props.status === "unavailable") {
    if (!props.workspaceId) {
      return (
        <ContentGuard
          loading={false}
          empty
          emptyTitle={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_TITLE")}
          emptyDescription={t("settings:SETTINGS_WORKSPACE_NOT_SELECTED_DESC")}
          container="raw"
          loadingVariant="form"
        />
      );
    }

    return (
      <section className="py-6" data-testid="workspace-roles-plan-gate">
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertTitle>{t("workspaceAccess:ROLES_PAID_FEATURE_TITLE")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>{t("errors:WORKSPACE_ROLE_MANAGEMENT_PLAN_REQUIRED")}</span>
            <span>{t("workspaceAccess:ROLES_PAID_FEATURE_DESCRIPTION")}</span>
            <Button type="button" onClick={props.onOpenPlanUsage}>
              {t("account:SETTINGS_NAV_WORKSPACE_PLAN_USAGE")}
            </Button>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <ContentGuard
      loading={props.status === "loading"}
      error={props.status === "error" ? props.error : null}
      onRetry={props.onRetry}
      container="raw"
      loadingVariant="form"
    >
      <div />
    </ContentGuard>
  );
}

export function SettingsScreenHost() {
  const { t } = useTranslation("team");
  const settingsScreen = useSettingsScreen();
  const isOpen = settingsScreen.state.open;
  const activeScreen = settingsScreen.state.screen;
  const activeItem = getUsercenterOverlayItem(activeScreen);
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const workspaceId = currentWorkspaceId;
  const { profile } = useCurrentUserProfile();
  const workspacesQuery = useQuery({
    queryKey: ["me", "workspaces", "settings-nav"],
    queryFn: listMyWorkspaces,
    enabled: isOpen,
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const rolesAccess = useWorkspaceRolesAccess(workspaceId ?? null);
  const settingsNavItems = resolveSettingsNavItems(rolesAccess.status);
  const [workspaceRoleCreateOpen, setWorkspaceRoleCreateOpen] = useState(false);
  const currentWorkspace = workspacesQuery.data?.items?.find(
    (workspace) => workspace.workspaceId === workspaceId || workspace.id === workspaceId,
  );
  const profileLabel = profile?.displayName ?? profile?.username ?? profile?.email;
  const identityOverrides: SettingsNavIdentityOverrides = {
    ...(profileLabel
      ? {
          "personal.profile": {
            label: profileLabel,
            icon: (
              <UserAvatar
                name={profileLabel}
                assetRef={profile?.avatarUrl ?? profile?.avatarAssetId}
                size={20}
                decorative
              />
            ),
          },
        }
      : {}),
    ...(currentWorkspace
      ? {
          "workspace.general": {
            label: currentWorkspace.name,
            icon: (
              <WorkspaceAvatar
                name={currentWorkspace.name}
                size={20}
                decorative
                {...workspaceAvatarPropsFromIdentity(currentWorkspace)}
              />
            ),
          },
        }
      : {}),
  };

  useEffect(() => {
    if (!settingsScreen.state.open) return;
    if (activeScreen === "workspace.roles" && settingsScreen.state.section === "create-role") {
      setWorkspaceRoleCreateOpen(true);
    }
  }, [activeScreen, settingsScreen.state.open, settingsScreen.state.section]);

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
  const renderedContent = !isOpen ? null : activeScreen === "workspace.roles" ? (
    rolesAccess.status === "available" ? (
      <TeamRolesPage
        workspaceIdOverride={workspaceId ?? null}
        createOpen={workspaceRoleCreateOpen}
        onCreateOpenChange={setWorkspaceRoleCreateOpen}
        embedded
      />
    ) : (
      <WorkspaceRolesGate
        workspaceId={workspaceId ?? null}
        status={rolesAccess.status}
        error={rolesAccess.error}
        onRetry={() => void rolesAccess.refetch()}
        onOpenPlanUsage={() => settingsScreen.switchSettingsScreen("workspace.plan-usage")}
      />
    )
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
        className="border border-border/80 bg-background shadow-2xl lg:h-[calc(83.3333dvh-83.3333px)]! lg:w-[75vw]! lg:max-w-[1260px]!"
      >
        <SettingsFrame
          activeScreen={activeScreen}
          items={settingsNavItems}
          identityOverrides={identityOverrides}
          action={action}
          onClose={() => handleOpenChange(false)}
          onSelectItem={(item) => settingsScreen.switchSettingsScreen(item.screen)}
          className="h-full w-full max-w-none rounded-none border-0 shadow-none"
        >
          {renderedContent}
        </SettingsFrame>
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

export const UsercenterOverlayHost = SettingsScreenHost;
