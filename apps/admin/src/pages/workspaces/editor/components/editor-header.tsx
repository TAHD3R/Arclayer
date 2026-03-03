import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Save,
  ArrowUpFromLine,
  Play,
  LogOut,
  Languages,
  Palette,
  ChevronRight,
  Check,
  Wifi,
  WifiOff,
  Download,
  Undo2,
  Redo2,
  Copy,
  ClipboardPaste,
  Trash2,
  CopyPlus,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Ruler,
  Square,
} from "lucide-react";
import { Button, Tooltip, Avatar } from "antd";

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarItemContent,
  MenubarSeparator,
  MenubarShortcut,
} from "@celestial/ui/menubar";
import { AdminLogo } from "@/components/layout/admin-logo";
import type { AppLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import {
  setThemeModeWithTransition,
  setThemePreferenceWithTransition,
} from "@/components/ui/theme-transition";
import {
  FloatingPanelRoot,
  FloatingPanelTrigger,
  FloatingPanelContent,
  FloatingPanelBody,
  useFloatingPanel,
} from "@celestial/ui/floating-panel";
import { Popover, PopoverTrigger, PopoverContent } from "@celestial/ui/popover";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { usePlatform } from "@/pages/workspaces/editor/hooks/use-platform";
import { useEditorActions } from "@/pages/workspaces/editor/hooks/use-editor-actions";
import { EditorPageSwitcher } from "@/pages/workspaces/editor/components/editor-page-switcher";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import * as authApi from "@/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import {
  normalizeUserProfile,
  initialsFromName,
  getUserDisplayName,
} from "@/lib/auth/user-profile";

/** Returns the platform-appropriate shortcut label. */
function useShortcut() {
  const { isMac } = usePlatform();
  return (mac: string, win: string) => (isMac ? mac : win);
}

function EditorUserMenuContent() {
  const { t } = useTranslation(["content_pages", "account"]);
  const { workspaceId } = useEditorConfig();
  const [showLangSub, setShowLangSub] = useState(false);
  const [showThemeSub, setShowThemeSub] = useState(false);

  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const themePreference = usePreferencesStore((s) => s.themePreference);

  const menuItemClass =
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-caption transition-colors hover:bg-accent";

  return (
    <div className="w-52">
      <div className="p-1">
        {/* Language */}
        <button
          type="button"
          className={menuItemClass}
          onClick={() => {
            setShowLangSub(!showLangSub);
            setShowThemeSub(false);
          }}
        >
          <Languages className="size-4 shrink-0" />
          <span className="flex-1 text-left">{t("content_pages:EDITOR_USER_MENU_LANGUAGE")}</span>
          <ChevronRight className="size-3.5 text-label-secondary" />
        </button>
        {showLangSub && (
          <div className="py-0.5 pl-6">
            {(["zh-CN", "en-US"] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                className={menuItemClass}
                onClick={() => setLocale(loc as AppLocale)}
              >
                <span className="flex-1 text-left">
                  {loc === "zh-CN"
                    ? t("account:ACCOUNT_LANGUAGE_ZH")
                    : t("account:ACCOUNT_LANGUAGE_EN")}
                </span>
                {locale === loc && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        )}

        {/* Theme */}
        <button
          type="button"
          className={menuItemClass}
          onClick={() => {
            setShowThemeSub(!showThemeSub);
            setShowLangSub(false);
          }}
        >
          <Palette className="size-4 shrink-0" />
          <span className="flex-1 text-left">{t("content_pages:EDITOR_USER_MENU_THEME")}</span>
          <ChevronRight className="size-3.5 text-label-secondary" />
        </button>
        {showThemeSub && (
          <div className="py-0.5 pl-6">
            {(["light", "dark", "system"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={menuItemClass}
                onClick={() => {
                  if (m === "system") {
                    void setThemePreferenceWithTransition("system", { direction: "ltr" });
                    return;
                  }
                  void setThemeModeWithTransition(m, { direction: "ltr" });
                }}
              >
                <span className="flex-1 text-left">
                  {t(`content_pages:EDITOR_USER_MENU_THEME_${m.toUpperCase()}` as const)}
                </span>
                {themePreference === m && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mx-2 my-1 h-px bg-border" />

      <div className="p-1">
        <button
          type="button"
          className={menuItemClass}
          onClick={() => {
            window.location.href = `/w/${workspaceId}`;
          }}
        >
          <LogOut className="size-4 shrink-0" />
          <span className="flex-1 text-left">{t("content_pages:EDITOR_USER_MENU_EXIT")}</span>
        </button>
      </div>
    </div>
  );
}

function BridgeStatusIndicator() {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const overlayCloseSignal = useEditorStore((s) => s.overlayCloseSignal);

  const portalOrigin = useMemo(() => {
    const raw = import.meta.env.VITE_PORTAL_ORIGIN as string | undefined;
    return raw && raw.trim() ? raw.trim() : "http://localhost:3100";
  }, []);

  const config = {
    connected: {
      icon: <Wifi className="size-4 text-green-500" />,
      label: t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTED"),
    },
    connecting: {
      icon: <Wifi className="size-4 animate-pulse text-amber-500" />,
      label: t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTING"),
    },
    disconnected: {
      icon: <WifiOff className="size-4 text-red-500" />,
      label: t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"),
    },
  } as const;

  const { icon, label } = config[bridgeStatus];
  const [open, setOpen] = useState(false);

  const latency = useBridgeLatency({ portal, enabled: bridgeStatus === "connected" && open });

  useEffect(() => {
    if (!open) return;
    setOpen(false);
  }, [overlayCloseSignal]); // Close on iframe focus.

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip title={label}>
        <PopoverTrigger asChild>
          <Button type="text" size="small" icon={icon} aria-label={label} />
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-80 space-y-3 p-3">
        <div>
          <div className="text-callout font-medium">
            {t("content_pages:EDITOR_BRIDGE_STATUS_TITLE")}
          </div>
          <div className="text-caption text-label-secondary">
            {t("content_pages:EDITOR_BRIDGE_STATUS_DESC")}
          </div>
        </div>

        <div className="space-y-2">
          <StatusRow
            title={t("content_pages:EDITOR_BRIDGE_STATUS_ITEM_CONNECTION")}
            desc={t("content_pages:EDITOR_BRIDGE_STATUS_ITEM_CONNECTION_DESC")}
            value={label}
          />
          <StatusRow
            title={t("content_pages:EDITOR_BRIDGE_STATUS_ITEM_ORIGIN")}
            desc={t("content_pages:EDITOR_BRIDGE_STATUS_ITEM_ORIGIN_DESC")}
            value={portalOrigin}
          />
          <StatusRow
            title={t("content_pages:EDITOR_BRIDGE_STATUS_ITEM_LATENCY")}
            desc={t("content_pages:EDITOR_BRIDGE_STATUS_ITEM_LATENCY_DESC")}
            value={
              bridgeStatus === "connected" && latency.rttMs != null ? `${latency.rttMs} ms` : "--"
            }
            meta={
              latency.updatedAtMs ? new Date(latency.updatedAtMs).toLocaleTimeString() : undefined
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusRow(props: { title: string; desc: string; value: string; meta?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-callout font-medium">{props.title}</div>
        <div className="text-callout font-semibold tabular-nums">{props.value}</div>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <div className="text-caption text-label-secondary">{props.desc}</div>
        {props.meta ? <div className="text-caption text-label-secondary">{props.meta}</div> : null}
      </div>
    </div>
  );
}

function useBridgeLatency(args: { portal: unknown; enabled: boolean }): {
  rttMs: number | null;
  updatedAtMs: number | null;
} {
  const portal = args.portal as null | { ping: (args: { sentAt: number }) => Promise<unknown> };
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [updatedAtMs, setUpdatedAtMs] = useState<number | null>(null);

  useEffect(() => {
    if (!args.enabled || !portal) return;

    let cancelled = false;

    const tick = async () => {
      const sentAt = Date.now();
      try {
        await portal.ping({ sentAt });
        if (cancelled) return;
        setRttMs(Math.max(0, Date.now() - sentAt));
        setUpdatedAtMs(Date.now());
      } catch {
        if (cancelled) return;
        setRttMs(null);
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [args.enabled, portal]);

  return { rttMs, updatedAtMs };
}

function EditorAvatar() {
  const { t } = useTranslation(["content_pages"]);
  const accessToken = useAuthStore((s) => s.accessToken);
  const sessionVersion = useAuthStore((s) => s.sessionVersion);
  const overlayCloseSignal = useEditorStore((s) => s.overlayCloseSignal);

  const meQuery = useQuery({
    queryKey: ["auth", "me", sessionVersion],
    enabled: Boolean(accessToken),
    queryFn: () => authApi.me(),
    meta: { silent: true },
  });

  const profile = useMemo(() => normalizeUserProfile(meQuery.data), [meQuery.data]);

  const displayName = useMemo(
    () =>
      profile.displayName ??
      profile.username ??
      profile.email ??
      getUserDisplayName(accessToken, "User"),
    [accessToken, profile.displayName, profile.username, profile.email],
  );

  const avatarSrc = resolveAssetRefToPublicUrlPath(profile.avatarUrl ?? profile.avatarAssetId);

  return (
    <FloatingPanelRoot>
      <CloseFloatingPanelOnOverlaySignal signal={overlayCloseSignal} />
      <FloatingPanelTrigger
        title={t("content_pages:EDITOR_USER_MENU_TITLE")}
        className="size-8 justify-center rounded-full border-0 bg-transparent"
      >
        <Avatar size={28} src={avatarSrc ?? undefined}>
          {initialsFromName(displayName)}
        </Avatar>
      </FloatingPanelTrigger>
      <FloatingPanelContent placement="bottom" className="w-auto">
        <FloatingPanelBody className="p-0">
          <EditorUserMenuContent />
        </FloatingPanelBody>
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}

function CloseFloatingPanelOnOverlaySignal({ signal }: { signal: number }) {
  const { isOpen, closeFloatingPanel } = useFloatingPanel();
  const lastSignalRef = useRef(signal);

  useEffect(() => {
    // Only close when the signal actually changes.
    // Avoid "open -> immediately close" due to the effect running on open state changes.
    if (signal === lastSignalRef.current) return;
    lastSignalRef.current = signal;

    if (!isOpen) return;
    closeFloatingPanel();
  }, [closeFloatingPanel, isOpen, signal]);

  return null;
}

export function EditorHeader() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId } = useEditorConfig();
  const sc = useShortcut();
  const actions = useEditorActions();

  return (
    <header className="flex h-12 shrink-0 items-center border-b bg-card px-3">
      {/* Left: Logo + Menubar */}
      <div className="flex items-center gap-2">
        <AdminLogo size={28} ariaLabel="Celestial" to={`/w/${workspaceId}`} />

        <Menubar className="border-none bg-transparent text-callout shadow-none">
          {/* File */}
          <MenubarMenu>
            <MenubarTrigger className="transition-colors">
              {t("content_pages:EDITOR_MENU_FILE")}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={!actions.isEnabled("file.save_draft")}
                onClick={() => void actions.run("file.save_draft")}
              >
                <MenubarItemContent icon={<Save className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_FILE_SAVE")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘S", "Ctrl+S")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("file.publish")}
                onClick={() => void actions.run("file.publish")}
              >
                <MenubarItemContent icon={<ArrowUpFromLine className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_FILE_PUBLISH")}
                </MenubarItemContent>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                <MenubarItemContent icon={<Download className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_FILE_EXPORT")}
                </MenubarItemContent>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onClick={() => {
                  window.location.href = `/w/${workspaceId}`;
                }}
              >
                <MenubarItemContent icon={<LogOut className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_FILE_EXIT")}
                </MenubarItemContent>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* Edit */}
          <MenubarMenu>
            <MenubarTrigger className="transition-colors">
              {t("content_pages:EDITOR_MENU_EDIT")}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={!actions.isEnabled("edit.undo")}
                onClick={() => void actions.run("edit.undo")}
              >
                <MenubarItemContent icon={<Undo2 className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_EDIT_UNDO")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘Z", "Ctrl+Z")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("edit.redo")}
                onClick={() => void actions.run("edit.redo")}
              >
                <MenubarItemContent icon={<Redo2 className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_EDIT_REDO")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⇧⌘Z", "Ctrl+Shift+Z")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                <MenubarItemContent icon={<Copy className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_EDIT_COPY")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘C", "Ctrl+C")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>
                <MenubarItemContent icon={<ClipboardPaste className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_EDIT_PASTE")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘V", "Ctrl+V")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("edit.delete")}
                onClick={() => void actions.run("edit.delete")}
              >
                <MenubarItemContent icon={<Trash2 className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_EDIT_DELETE")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌫", "Del")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={!actions.isEnabled("edit.duplicate")}
                onClick={() => void actions.run("edit.duplicate")}
              >
                <MenubarItemContent icon={<CopyPlus className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_EDIT_DUPLICATE")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘D", "Ctrl+D")}</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* View */}
          <MenubarMenu>
            <MenubarTrigger className="transition-colors">
              {t("content_pages:EDITOR_MENU_VIEW")}
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem
                disabled={!actions.isEnabled("view.zoom_in")}
                onClick={() => void actions.run("view.zoom_in")}
              >
                <MenubarItemContent icon={<ZoomIn className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_VIEW_ZOOM_IN")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘+", "Ctrl++")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("view.zoom_out")}
                onClick={() => void actions.run("view.zoom_out")}
              >
                <MenubarItemContent icon={<ZoomOut className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_VIEW_ZOOM_OUT")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘-", "Ctrl+-")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("view.zoom_reset")}
                onClick={() => void actions.run("view.zoom_reset")}
              >
                <MenubarItemContent icon={<RotateCcw className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_VIEW_ZOOM_RESET")}
                </MenubarItemContent>
                <MenubarShortcut>{sc("⌘0", "Ctrl+0")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                <MenubarItemContent icon={<Ruler className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_VIEW_GUIDES")}
                </MenubarItemContent>
              </MenubarItem>
              <MenubarItem disabled>
                <MenubarItemContent icon={<Square className="size-4" />}>
                  {t("content_pages:EDITOR_MENU_VIEW_BOUNDS")}
                </MenubarItemContent>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      {/* Center: Page switcher */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <EditorPageSwitcher />
      </div>

      {/* Right: BridgeStatus + Preview + Publish + Avatar */}
      <div className="ml-auto flex items-center gap-2">
        <BridgeStatusIndicator />

        {/* Preview */}
        <Tooltip title={t("content_pages:EDITOR_SITE_ACTION_PREVIEW")}>
          <Button
            type="text"
            icon={<Play className="size-3.5" />}
            onClick={() => void actions.run("view.toggle_preview")}
          />
        </Tooltip>

        {/* Publish */}
        <Button
          type="primary"
          disabled={!actions.isEnabled("file.publish")}
          icon={<ArrowUpFromLine className="size-3.5" />}
          onClick={() => void actions.run("file.publish")}
        >
          {t("content_pages:EDITOR_TOOLBAR_PUBLISH")}
        </Button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-border" />

        {/* Avatar */}
        <EditorAvatar />
      </div>
    </header>
  );
}
