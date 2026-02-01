import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Languages,
  LogOut,
  Moon,
  SlidersHorizontal,
  Settings,
  Sun,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import * as authApi from "@/api/auth";
import { getMyOrganization } from "@/api/me";
import { getMyWorkspaceAuthz } from "@/api/workspaces";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePreferencesStore } from "@/stores/usePreferenceStore";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { setThemeModeWithTransition } from "@/components/ui/theme-transition";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import { cn } from "@/lib/utils";

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
        <span className="min-w-0 truncate text-sm font-medium">{props.label}</span>
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
} {
  const data = asRecord(raw);
  if (!data) {
    return { username: null, email: null, displayName: null, avatarUrl: null };
  }
  return {
    username: getStringValue(data, ["username"]),
    email: getStringValue(data, ["email"]),
    displayName: getStringValue(data, ["display_name", "displayName"]),
    avatarUrl: getStringValue(data, ["avatar_url", "avatarUrl"]),
  };
}

function getPrimaryRoleCode(input: { isSuper: boolean; roleCodes: string[] }): string {
  if (input.isSuper) return "superuser";
  // Prefer "admin" as the primary role when it exists.
  if (input.roleCodes.includes("admin")) return "admin";
  if (input.roleCodes.includes("user")) return "user";
  return input.roleCodes[0] ?? "user";
}

function AdminAccountPanelContent(props: {
  displayName: string;
  avatarUrl: string | null;
  roleText: string;
  showOrganizationSettings: boolean;
  themeMode: "light" | "dark";
  locale: "zh-CN" | "en-US";
  setLocale: (locale: "zh-CN" | "en-US") => void;
  onLogout: () => Promise<void>;
  onPersonalSettings: () => Promise<void> | void;
  onNotifications: () => Promise<void> | void;
  onOrganizationSettings: () => Promise<void> | void;
}) {
  const { t } = useTranslation("account");
  const { isOpen, closeFloatingPanel } = useFloatingPanel();
  const [view, setView] = useState<"root" | "preferences" | "theme" | "language">("root");

  useEffect(() => {
    // Reset to root view whenever the panel closes to avoid reopening in a sub-view.
    if (!isOpen) setView("root");
  }, [isOpen]);

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

  if (view === "theme") {
    return (
      <div className="w-72">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            aria-label={t("common:BACK")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-2 py-2",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setView("root")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-semibold">{t("ACCOUNT_THEME")}</div>
        </div>

        {divider()}

        <div className="py-1">
          <FloatingPanelButton
            className={menuItemClassName}
            onClick={() => {
              closeFloatingPanel();
              void setThemeModeWithTransition("light", { direction: "ltr" });
            }}
          >
            <MenuItemContent
              icon={<Sun />}
              label={t("ACCOUNT_THEME_LIGHT")}
              right={props.themeMode === "light" ? <Check className="size-4" /> : null}
            />
          </FloatingPanelButton>
          <FloatingPanelButton
            className={menuItemClassName}
            onClick={() => {
              closeFloatingPanel();
              void setThemeModeWithTransition("dark", { direction: "ltr" });
            }}
          >
            <MenuItemContent
              icon={<Moon />}
              label={t("ACCOUNT_THEME_DARK")}
              right={props.themeMode === "dark" ? <Check className="size-4" /> : null}
            />
          </FloatingPanelButton>
        </div>
      </div>
    );
  }

  if (view === "language") {
    return (
      <div className="w-72">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            aria-label={t("common:BACK")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-2 py-2",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setView("root")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-semibold">{t("ACCOUNT_LANGUAGE")}</div>
        </div>

        {divider()}

        <div className="py-1">
          <FloatingPanelButton
            className={menuItemClassName}
            onClick={() => onClickAndClose(() => props.setLocale("zh-CN"))}
          >
            <MenuItemContent
              label={t("ACCOUNT_LANGUAGE_ZH")}
              right={props.locale === "zh-CN" ? <Check className="size-4" /> : null}
            />
          </FloatingPanelButton>
          <FloatingPanelButton
            className={menuItemClassName}
            onClick={() => onClickAndClose(() => props.setLocale("en-US"))}
          >
            <MenuItemContent
              label={t("ACCOUNT_LANGUAGE_EN")}
              right={props.locale === "en-US" ? <Check className="size-4" /> : null}
            />
          </FloatingPanelButton>
        </div>
      </div>
    );
  }

  if (view === "preferences") {
    return (
      <div className="w-72">
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            aria-label={t("common:BACK")}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-2 py-2",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => setView("root")}
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-semibold">{t("ACCOUNT_PREFERENCES")}</div>
        </div>

        {divider()}

        <div className="py-1">
          <FloatingPanelButton className={menuItemClassName} onClick={() => setView("theme")}>
            <MenuItemContent
              icon={<Sun />}
              label={t("ACCOUNT_THEME")}
              right={<ChevronRight className="size-4" />}
            />
          </FloatingPanelButton>

          <FloatingPanelButton className={menuItemClassName} onClick={() => setView("language")}>
            <MenuItemContent
              icon={<Languages />}
              label={t("ACCOUNT_LANGUAGE")}
              right={<ChevronRight className="size-4" />}
            />
          </FloatingPanelButton>
        </div>
      </div>
    );
  }

  return (
    <div className="w-72">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <Avatar
            size={48}
            src={props.avatarUrl ?? undefined}
            shape="square"
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
        <FloatingPanelButton className={menuItemClassName} onClick={() => setView("preferences")}>
          <MenuItemContent
            icon={<SlidersHorizontal />}
            label={t("ACCOUNT_PREFERENCES")}
            right={<ChevronRight className="size-4" />}
          />
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
  const clear = useAuthStore((s) => s.clear);
  const accessToken = useAuthStore((s) => s.accessToken);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);

  const themeMode = usePreferencesStore((s) => s.themeMode);
  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);

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

  const onLogout = async () => {
    clear();
    await navigate({ to: "/login", replace: true });
  };

  const onPersonalSettings = () => {
    void navigate({ to: "/" });
  };

  const onNotifications = () => {
    if (workspaceId) {
      void navigate({ to: `/w/${workspaceId}/notifications` });
      return;
    }
    void navigate({ to: "/" });
  };

  const isOrgOwner = myOrgQuery.data?.membership?.role === "owner";
  const onOrganizationSettings = () => {
    if (workspaceId) {
      void navigate({ to: `/w/${workspaceId}/settings/organization` });
      return;
    }
    void navigate({ to: "/settings/organization" });
  };

  return (
    <FloatingPanelRoot className="w-full">
      <FloatingPanelTrigger
        title={t("ACCOUNT_TITLE")}
        className={cn(
          "group w-full justify-start gap-3",
          "px-4 py-3",
          "border-0 bg-transparent",
          "rounded-none",
          "text-muted-foreground",
          "hover:bg-primary hover:text-sidebar-accent-foreground",
          "data-[state=open]:bg-primary data-[state=open]:text-sidebar-accent-foreground",
          "transition-colors duration-150 ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
        )}
      >
        <Avatar
          size={40}
          shape="square"
          src={profile.avatarUrl ?? undefined}
          style={{
            backgroundColor: "var(--card-muted)",
            color: "var(--color-foreground)",
            flexShrink: 0,
          }}
        >
          {initialsFromName(displayName)}
        </Avatar>

        <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left leading-tight">
          <Typography.Text
            strong
            ellipsis={{ tooltip: displayName }}
            style={{ maxWidth: "100%", display: "block" }}
            className={cn(
              "text-sidebar-foreground",
              "group-hover:text-sidebar-accent-foreground",
              "group-data-[state=open]:text-sidebar-accent-foreground",
            )}
          >
            {displayName}
          </Typography.Text>
        </span>

        <ChevronDown className="size-4 shrink-0 opacity-70 transition-colors group-hover:opacity-100" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="auto" showTitle={false} className="p-0">
        <AdminAccountPanelContent
          displayName={displayName}
          avatarUrl={profile.avatarUrl}
          roleText={roleText}
          showOrganizationSettings={isOrgOwner}
          themeMode={themeMode}
          locale={locale}
          setLocale={setLocale}
          onLogout={onLogout}
          onPersonalSettings={onPersonalSettings}
          onNotifications={onNotifications}
          onOrganizationSettings={onOrganizationSettings}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
