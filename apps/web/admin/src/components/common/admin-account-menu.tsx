import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar } from "antd";
import { useTranslation } from "react-i18next";
import { Boxes, Building2, ChevronDown, CircleHelp, Inbox, LogOut, UserCog } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import * as authApi from "@/api/auth";
import { getMyOrganization } from "@/api/me";
import { useAuthStore } from "@/stores/use-auth-store";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import { buildOrganizationPath, parseOrganizationIdFromPath } from "@/lib/organization-routing";
import { cn } from "@/lib/utils";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { getUserDisplayName, initialsFromName, normalizeUserProfile } from "@/lib/user-profile";

function MenuItemContent(props: { icon?: ReactNode; label: string; right?: ReactNode }) {
  return (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? <span className="shrink-0 [&>svg]:size-4">{props.icon}</span> : null}
        <span className="min-w-0 truncate text-footnote font-medium">{props.label}</span>
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
          <Avatar
            size={48}
            src={resolveAssetRefToPublicUrlPath(props.avatarUrl) ?? undefined}
            style={{
              backgroundColor: "var(--color-muted)",
              color: "var(--color-foreground)",
              flexShrink: 0,
            }}
          >
            {initialsFromName(props.displayName)}
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="truncate text-footnote font-semibold">{props.displayName}</div>
            {props.email ? (
              <div className="truncate text-caption text-label-secondary">{props.email}</div>
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

      <div className="py-1">
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

export function AdminAccountMenu() {
  const navigate = useNavigate();
  const { t } = useTranslation("account");
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization"],
    enabled: Boolean(accessToken),
    queryFn: async () => getMyOrganization(),
    meta: { silent: true },
  });

  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);

  const displayName = useMemo(
    () =>
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, "用户"),
    [accessToken, profile.displayName, profile.username, profile.email],
  );

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const currentOrganizationId = routeOrganizationId || myOrgQuery.data?.organization.id || null;

  const onLogout = async () => {
    clear();
    await navigate({ to: "/login", replace: true });
  };

  const onAccountSettings = () => {
    if (currentOrganizationId) {
      void navigate({ to: buildOrganizationPath(currentOrganizationId) });
      return;
    }
    void navigate({ to: "/" });
  };

  const onNotifications = () => {
    void navigate({ to: "/me/notifications" });
  };

  const onWorkspaces = () => {
    if (currentOrganizationId) {
      void navigate({ to: buildOrganizationPath(currentOrganizationId, "/workspaces") });
      return;
    }
    void navigate({ to: "/" });
  };

  const onHelpCenter = () => {
    // TODO: route not yet available
  };

  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";
  const onOrganizationSettings = () => {
    if (currentOrganizationId) {
      void navigate({ to: buildOrganizationPath(currentOrganizationId, "/settings") });
      return;
    }
    void navigate({ to: "/" });
  };

  const triggerClassName = cn(
    "group justify-start gap-3",
    "w-full",
    "px-4 py-3",
    "border-0 bg-transparent",
    "rounded-none",
    "text-label-secondary",
    "hover:bg-accent hover:text-sidebar-accent-foreground",
    "data-[state=open]:bg-accent data-[state=open]:text-sidebar-accent-foreground",
    "transition-colors duration-150 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
  );

  const nameClassName = cn(
    "text-sidebar-foreground",
    "group-hover:text-sidebar-accent-foreground",
    "group-data-[state=open]:text-sidebar-accent-foreground",
  );

  return (
    <FloatingPanelRoot className="w-full">
      <FloatingPanelTrigger title={t("ACCOUNT_TITLE")} className={triggerClassName}>
        <Avatar
          size={32}
          src={
            resolveAssetRefToPublicUrlPath(profile.avatarUrl ?? profile.avatarAssetId) ?? undefined
          }
        >
          {initialsFromName(displayName)}
        </Avatar>

        <div className="min-w-0 text-left">
          <div className={cn("truncate text-footnote font-semibold", nameClassName)}>
            {displayName}
          </div>
          {profile.email ? (
            <div className="truncate text-caption text-label-secondary">{profile.email}</div>
          ) : null}
        </div>

        <ChevronDown className="ml-auto size-4 shrink-0 opacity-70 transition-colors group-hover:opacity-100" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="top" showTitle={false} className="p-0">
        <AdminAccountPanelContent
          displayName={displayName}
          email={profile.email}
          avatarUrl={profile.avatarUrl ?? profile.avatarAssetId}
          showOrganizationSettings={canManageOrganization}
          onLogout={onLogout}
          onAccountSettings={onAccountSettings}
          onOrganizationSettings={onOrganizationSettings}
          onWorkspaces={onWorkspaces}
          onNotifications={onNotifications}
          onHelpCenter={onHelpCenter}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
