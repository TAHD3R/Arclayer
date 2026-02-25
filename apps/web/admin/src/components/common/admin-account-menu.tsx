import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { ChevronDown, Inbox, LogOut, Settings } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import * as authApi from "@/api/auth";
import { getMyOrganization } from "@/api/me";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import { useAuthStore } from "@/stores/use-auth-store";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
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

type JwtClaims = Record<string, unknown>;

function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

function asNonEmptyString(input: unknown): string | null {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function getUserDisplayName(accessToken: string | null, fallback: string): string {
  if (!accessToken) return fallback;
  const claims = decodeJwtClaims(accessToken);
  if (!claims) return fallback;

  return (
    asNonEmptyString(claims.name) ??
    asNonEmptyString(claims.username) ??
    asNonEmptyString(claims.preferred_username) ??
    asNonEmptyString(claims.email) ??
    fallback
  );
}

function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0].slice(0, 1)}${parts[parts.length - 1].slice(0, 1)}`.toUpperCase();
}

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

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  return input as Record<string, unknown>;
}

function getStringValue(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string") return v;
  }
  return null;
}

function getBooleanValue(record: Record<string, unknown>, keys: readonly string[]): boolean | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "boolean") return v;
  }
  return null;
}

function getStringArrayValue(
  record: Record<string, unknown>,
  keys: readonly string[],
): string[] | null {
  for (const k of keys) {
    const v = record[k];
    if (!Array.isArray(v)) continue;
    if (v.every((item) => typeof item === "string")) return v;
  }
  return null;
}

function normalizeUserProfile(raw: unknown): {
  username: string | null;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  avatarAssetId: string | null;
} {
  const data = asRecord(raw);
  if (!data) {
    return { username: null, email: null, displayName: null, avatarUrl: null, avatarAssetId: null };
  }
  return {
    username: getStringValue(data, ["username"]),
    email: getStringValue(data, ["email"]),
    displayName: getStringValue(data, ["display_name", "displayName"]),
    avatarUrl: getStringValue(data, ["avatar_url", "avatarUrl"]),
    avatarAssetId: getStringValue(data, ["avatar_asset_id", "avatarAssetId"]),
  };
}

function getPrimaryRoleCode(input: { isSuper: boolean; roleCodes: string[] }): string {
  if (input.isSuper) return "superuser";
  if (input.roleCodes.includes("admin")) return "admin";
  if (input.roleCodes.includes("user")) return "user";
  return input.roleCodes[0] ?? "user";
}

function AdminAccountPanelContent(props: {
  displayName: string;
  avatarUrl: string | null;
  roleText: string;
  showOrganizationSettings: boolean;
  onLogout: () => Promise<void>;
  onPersonalSettings: () => Promise<void> | void;
  onNotifications: () => Promise<void> | void;
  onOrganizationSettings: () => Promise<void> | void;
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
    "hover:bg-primary hover:text-primary-foreground",
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
            <Typography.Text
              strong
              ellipsis={{ tooltip: props.displayName }}
              style={{ display: "block" }}
            >
              {props.displayName}
            </Typography.Text>
            <div className="pt-1">
              <Tag className="m-0" variant="filled">
                {props.roleText}
              </Tag>
            </div>
          </div>
        </div>
      </div>

      {divider()}

      <div className="py-1">
        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onPersonalSettings)}
        >
          <MenuItemContent icon={<Settings />} label={t("ACCOUNT_PERSONAL_SETTINGS")} />
        </FloatingPanelButton>

        {props.showOrganizationSettings ? (
          <FloatingPanelButton
            className={menuItemClassName}
            onClick={() => onClickAndClose(props.onOrganizationSettings)}
          >
            <MenuItemContent icon={<Settings />} label={t("ACCOUNT_ORGANIZATION_SETTINGS")} />
          </FloatingPanelButton>
        ) : null}

        <FloatingPanelButton
          className={menuItemClassName}
          onClick={() => onClickAndClose(props.onNotifications)}
        >
          <MenuItemContent icon={<Inbox />} label={t("ACCOUNT_NOTIFICATIONS")} />
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
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    enabled: Boolean(accessToken),
    queryFn: async () => authApi.me(),
    meta: { silent: true },
  });

  const authzQuery = useQuery({
    queryKey: ["workspaces", "me", "authz", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: async () => getMyWorkspaceAuthz(String(workspaceId)),
    meta: { silent: true },
  });

  const myOrgQuery = useQuery({
    queryKey: ["me", "organization"],
    enabled: Boolean(accessToken),
    queryFn: async () => getMyOrganization(),
    meta: { silent: true },
  });

  const rawAuthz = asRecord(authzQuery.data) ?? {};
  const isSuper = getBooleanValue(rawAuthz, ["is_superuser", "isSuperuser"]) ?? false;
  const roleCodes = getStringArrayValue(rawAuthz, ["role_codes", "roleCodes"]) ?? [];

  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);

  const displayName = useMemo(
    () =>
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, "用户"),
    [accessToken, profile.displayName, profile.username, profile.email],
  );

  const roleText = useMemo(() => {
    const role = getPrimaryRoleCode({ isSuper, roleCodes });
    if (role === "superuser") return t("ACCOUNT_ROLE_SUPERUSER");
    if (role === "admin") return t("ACCOUNT_ROLE_ADMIN");
    if (role === "user") return t("ACCOUNT_ROLE_USER");
    return role;
  }, [isSuper, roleCodes, t]);

  const routeOrganizationId = parseOrganizationIdFromPath(pathname);
  const currentOrganizationId = routeOrganizationId || myOrgQuery.data?.organization.id || null;

  const onLogout = async () => {
    clear();
    await navigate({ to: "/login", replace: true });
  };

  const onPersonalSettings = () => {
    if (currentOrganizationId) {
      void navigate({ to: buildOrganizationPath(currentOrganizationId) });
      return;
    }
    void navigate({ to: "/" });
  };

  const onNotifications = () => {
    void navigate({ to: "/me/notifications" });
  };

  const canManageOrganization =
    myOrgQuery.data?.membership?.role === "owner" || myOrgQuery.data?.membership?.role === "admin";
  const onOrganizationSettings = () => {
    if (currentOrganizationId) {
      void navigate({ to: buildOrganizationPath(currentOrganizationId, "/settings/organization") });
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
    "hover:bg-primary hover:text-sidebar-accent-foreground",
    "data-[state=open]:bg-primary data-[state=open]:text-sidebar-accent-foreground",
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

        <span>
          <Typography.Text
            strong
            ellipsis={{ tooltip: displayName }}
            style={{ maxWidth: "100%", display: "block" }}
            className={nameClassName}
          >
            {displayName}
          </Typography.Text>
        </span>

        <ChevronDown className="size-4 shrink-0 opacity-70 transition-colors group-hover:opacity-100" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="top" showTitle={false} className="p-0">
        <AdminAccountPanelContent
          displayName={displayName}
          avatarUrl={profile.avatarUrl ?? profile.avatarAssetId}
          roleText={roleText}
          showOrganizationSettings={canManageOrganization}
          onLogout={onLogout}
          onPersonalSettings={onPersonalSettings}
          onNotifications={onNotifications}
          onOrganizationSettings={onOrganizationSettings}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
