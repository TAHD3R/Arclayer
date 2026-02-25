import { useMemo, useState } from "react";
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
  MenubarSeparator,
  MenubarShortcut,
} from "@/components/ui/menubar";
import { AdminLogo } from "@/components/common/admin-logo";
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
} from "@/components/ui/floating-panel";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { usePlatform } from "@/pages/workspaces/editor/hooks/use-platform";
import { useEditorActions } from "@/pages/workspaces/editor/hooks/use-editor-actions";
import { EditorPageSwitcher } from "@/pages/workspaces/editor/components/editor-page-switcher";
import * as authApi from "@/api/auth";
import { useAuthStore } from "@/stores/use-auth-store";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { normalizeUserProfile, initialsFromName, getUserDisplayName } from "@/lib/user-profile";

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
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);

  const config = {
    connected: {
      icon: <Wifi className="size-3.5 text-green-500" />,
      label: t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTED"),
    },
    connecting: {
      icon: <Wifi className="size-3.5 animate-pulse text-amber-500" />,
      label: t("content_pages:EDITOR_SHELL_BRIDGE_CONNECTING"),
    },
    disconnected: {
      icon: <WifiOff className="size-3.5 text-red-500" />,
      label: t("content_pages:EDITOR_SHELL_BRIDGE_DISCONNECTED"),
    },
  } as const;

  const { icon, label } = config[bridgeStatus];

  return (
    <Tooltip title={label}>
      <Button type="text" size="small" className="cursor-default" icon={icon} />
    </Tooltip>
  );
}

function EditorAvatar() {
  const { t } = useTranslation(["content_pages"]);
  const accessToken = useAuthStore((s) => s.accessToken);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
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
                <Save className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_FILE_SAVE")}
                <MenubarShortcut>{sc("⌘S", "Ctrl+S")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("file.publish")}
                onClick={() => void actions.run("file.publish")}
              >
                <ArrowUpFromLine className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_FILE_PUBLISH")}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                <Download className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_FILE_EXPORT")}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onClick={() => {
                  window.location.href = `/w/${workspaceId}`;
                }}
              >
                <LogOut className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_FILE_EXIT")}
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
                <Undo2 className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_EDIT_UNDO")}
                <MenubarShortcut>{sc("⌘Z", "Ctrl+Z")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("edit.redo")}
                onClick={() => void actions.run("edit.redo")}
              >
                <Redo2 className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_EDIT_REDO")}
                <MenubarShortcut>{sc("⇧⌘Z", "Ctrl+Shift+Z")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                <Copy className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_EDIT_COPY")}
                <MenubarShortcut>{sc("⌘C", "Ctrl+C")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem disabled>
                <ClipboardPaste className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_EDIT_PASTE")}
                <MenubarShortcut>{sc("⌘V", "Ctrl+V")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("edit.delete")}
                onClick={() => void actions.run("edit.delete")}
              >
                <Trash2 className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_EDIT_DELETE")}
                <MenubarShortcut>{sc("⌫", "Del")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                disabled={!actions.isEnabled("edit.duplicate")}
                onClick={() => void actions.run("edit.duplicate")}
              >
                <CopyPlus className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_EDIT_DUPLICATE")}
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
                <ZoomIn className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_VIEW_ZOOM_IN")}
                <MenubarShortcut>{sc("⌘+", "Ctrl++")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("view.zoom_out")}
                onClick={() => void actions.run("view.zoom_out")}
              >
                <ZoomOut className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_VIEW_ZOOM_OUT")}
                <MenubarShortcut>{sc("⌘-", "Ctrl+-")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={!actions.isEnabled("view.zoom_reset")}
                onClick={() => void actions.run("view.zoom_reset")}
              >
                <RotateCcw className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_VIEW_ZOOM_RESET")}
                <MenubarShortcut>{sc("⌘0", "Ctrl+0")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem disabled>
                <Ruler className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_VIEW_GUIDES")}
              </MenubarItem>
              <MenubarItem disabled>
                <Square className="mr-2 size-4" />
                {t("content_pages:EDITOR_MENU_VIEW_BOUNDS")}
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
