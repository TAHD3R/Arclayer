import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Avatar } from "antd";
import { useTranslation } from "react-i18next";
import { Boxes, Building2, ChevronDown, CircleHelp, Inbox, LogOut, UserCog } from "lucide-react";
import { type ReactNode } from "react";

import * as authApi from "@/api/auth";
import { getMyOrganization } from "@/api/me";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@celestial/ui/floating-panel";
import { cn } from "@celestial/lib/utils";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import {
  getUserDisplayName,
  initialsFromName,
  normalizeUserProfile,
} from "@/lib/auth/user-profile";
import { queryClient } from "@/lib/query/query-client-instance";
import {
  buildOrganizationPath,
  parseOrganizationIdFromPath,
} from "@/lib/routing/organization-routing";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceSwitchDialogStore } from "@/stores/use-workspace-switch-dialog-store";
import { useSidebar } from "@celestial/ui/sidebar";
import { NAV_ITEM_COLLAPSE_HIDE_CLASSNAME } from "@/components/layout/admin-side-nav/nav-node-styles";

function MenuItemContent(props: { icon?: ReactNode; label: string; right?: ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? <span className="shrink-0 [&>svg]:size-4">{props.icon}</span> : null}
        <span className="min-w-0 truncate text-callout">{props.label}</span>
      </span>
      {props.right ? (
        <span className="shrink-0 opacity-70 transition-opacity group-hover:opacity-100">
          {props.right}
        </span>
      ) : null}
    </>
  );
}

function divider() {
  return <div className="mx-4 my-2 h-px bg-border/60" />;
}

function AdminAccountPanelContent(props: {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  showOrganizationSettings: boolean;
  onLogout: () => Promise<void>;
  onAccountSettings: () => Promise<void> | void;
  onOrganizationSettings: () => Promise<void> | void;
  onWorkspaces: () => Promise<void> | void;
  onNotifications: () => Promise<void> | void;
  onHelpCenter: () => Promise<void> | void;
}) {
  const { t } = useTranslation("account");
  const { closeFloatingPanel } = useFloatingPanel();

  const onClickAndClose = async (fn: () => Promise<void> | void) => {
    await fn();
    closeFloatingPanel();
  };

  const menuItemClassName = cn(
    "group",
    "transition-colors",
    "hover:bg-accent hover:text-primary-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  );

  return (
    <div className="w-72">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <Avatar size={56} src={resolveAssetRefToPublicUrlPath(props.avatarUrl) ?? undefined}>
            {initialsFromName(props.displayName)}
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="truncate text-headline">{props.displayName}</div>
            {props.email ? (
              <div className="truncate text-callout text-label-secondary">{props.email}</div>
            ) : null}
          </div>
        </div>
      </div>

      {divider()}

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onAccountSettings)}
        >
          <MenuItemContent icon={<UserCog />} label={t("ACCOUNT_ACCOUNT_SETTINGS")} />
        </FloatingPanelButton>

        {props.showOrganizationSettings ? (
          <FloatingPanelButton
            className={menuItemClassName}
            onClick={() => onClickAndClose(props.onOrganizationSettings)}
          >
            <MenuItemContent icon={<Building2 />} label={t("ACCOUNT_ORGANIZATION_SETTINGS")} />
          </FloatingPanelButton>
        ) : null}
      </div>

      {divider()}

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onWorkspaces)}
        >
          <MenuItemContent icon={<Boxes />} label={t("ACCOUNT_WORKSPACES")} />
        </FloatingPanelButton>

        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onNotifications)}
        >
          <MenuItemContent icon={<Inbox />} label={t("ACCOUNT_NOTIFICATIONS")} />
        </FloatingPanelButton>

        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onHelpCenter)}
        >
          <MenuItemContent icon={<CircleHelp />} label={t("ACCOUNT_HELP_CENTER")} />
        </FloatingPanelButton>
      </div>

      {divider()}

      <div>
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onLogout)}
        >
          <MenuItemContent icon={<LogOut />} label={t("ACCOUNT_LOGOUT")} />
        </FloatingPanelButton>
      </div>
    </div>
  );
}

type AdminAccountMenuModel = {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  canManageOrganization: boolean;
  onLogout: () => Promise<void>;
  onAccountSettings: () => void;
  onOrganizationSettings: () => void;
  onWorkspaces: () => void;
  onNotifications: () => void;
  onHelpCenter: () => void;
};

function useAdminAccountMenuModel(): AdminAccountMenuModel {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const clear = useAuthStore((s) => s.clear);
  const openWorkspaceSwitchDialog = useWorkspaceSwitchDialogStore((s) => s.openDialog);

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });
  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);
  const displayName = useMemo(() => {
    return (
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, "用户")
    );
  }, [accessToken, profile.displayName, profile.email, profile.username]);

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: async () => getMyOrganization(),
    meta: { silent: true },
  });

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const currentOrganizationId = routeOrganizationId || myOrgQuery.data?.organization.id || null;
  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";

  const onLogout = async () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    clear();
    await navigate({ to: "/login", replace: true });
  };

  return {
    displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl ?? profile.avatarAssetId,
    canManageOrganization,
    onLogout,
    onAccountSettings: () => void navigate({ to: "/me/profile" }),
    onOrganizationSettings: () => {
      if (!currentOrganizationId) {
        void navigate({ to: "/" });
        return;
      }
      void navigate({ to: buildOrganizationPath(currentOrganizationId, "/settings") as never });
    },
    onWorkspaces: () => {
      if (!currentOrganizationId) {
        void navigate({ to: "/" });
        return;
      }
      openWorkspaceSwitchDialog({ organizationId: currentOrganizationId });
    },
    onNotifications: () => void navigate({ to: "/me/inbox" }),
    onHelpCenter: () => window.location.assign("#"),
  };
}

export function AdminAccountMenu() {
  const { t } = useTranslation("account");
  const model = useAdminAccountMenuModel();
  const { state: sidebarState, isMobile } = useSidebar();
  const isCollapsed = sidebarState === "collapsed" && !isMobile;

  const triggerClassName = cn(
    "group",
    "flex w-full items-center",
    "h-16 py-0",
    "justify-start gap-3 px-5",
    // In collapsed state, sidebar width is 56px and avatar is 40px.
    // Use padding (animatable) instead of `justify-center` (non-animatable) to keep the avatar centered smoothly.
    "group-data-[collapsible=icon]:px-2",
    "group-data-[collapsible=icon]:gap-0",
    "border-0 bg-transparent",
    "rounded-none",
    "text-label-secondary",
    "hover:bg-accent hover:text-sidebar-accent-foreground",
    "data-[state=open]:bg-accent data-[state=open]:text-sidebar-accent-foreground",
    "transition-[color,background-color,padding,gap] duration-400 ease-[cubic-bezier(0.75,0,0.25,1)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  );

  const nameClassName = cn(
    "text-sidebar-foreground",
    "group-hover:text-sidebar-accent-foreground",
    "group-data-[state=open]:text-sidebar-accent-foreground",
  );

  const emailClassName = "text-label-secondary";

  return (
    <FloatingPanelRoot className="w-full">
      <FloatingPanelTrigger
        title={isCollapsed ? model.displayName : t("ACCOUNT_TITLE")}
        className={triggerClassName}
      >
        <Avatar
          size={40}
          className="shrink-0"
          src={resolveAssetRefToPublicUrlPath(model.avatarUrl) ?? undefined}
        >
          {initialsFromName(model.displayName)}
        </Avatar>

        <div className={cn("min-w-0 text-left flex-1", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
          <div className={cn("truncate text-footnote font-semibold", nameClassName)}>
            {model.displayName}
          </div>
          {model.email ? (
            <div className={cn("truncate text-caption", emailClassName)}>{model.email}</div>
          ) : null}
        </div>

        <ChevronDown
          className={cn(
            "ml-auto group-data-[collapsible=icon]:ml-0 size-4 shrink-0 opacity-70 transition-colors group-hover:opacity-100",
            NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
          )}
        />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="bottom" showTitle={false} className="p-0">
        <AdminAccountPanelContent
          displayName={model.displayName}
          email={model.email}
          avatarUrl={model.avatarUrl}
          showOrganizationSettings={model.canManageOrganization}
          onLogout={model.onLogout}
          onAccountSettings={model.onAccountSettings}
          onOrganizationSettings={model.onOrganizationSettings}
          onWorkspaces={model.onWorkspaces}
          onNotifications={model.onNotifications}
          onHelpCenter={model.onHelpCenter}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
