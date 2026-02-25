import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Save,
  Globe,
  User,
  ChevronDown,
  LogOut,
  Languages,
  Palette,
  ChevronRight,
  Check,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button, Tooltip, Avatar, Space, Popover, Checkbox, InputNumber } from "antd";

import {
  CORE_BLOCK_MANIFESTS,
  resolveLocalizedValue,
  type ViewerContext,
} from "@celestial/site-block-protocol";

import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { AdminLogo } from "@/components/common/admin-logo";
import type { AppLocale } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/use-preference-store";
import { toggleThemeModeWithTransition } from "@/components/ui/theme-transition";
import {
  FloatingPanelRoot,
  FloatingPanelTrigger,
  FloatingPanelContent,
  FloatingPanelBody,
} from "@/components/ui/floating-panel";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorSaveContext } from "@/pages/workspaces/editor/contexts/editor-save-context";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { usePlatform } from "@/pages/workspaces/editor/hooks/use-platform";

const VIEWER_CTX: ViewerContext = { locale: "zh-CN", fallbackLocale: "en-US" };

/** Returns the platform-appropriate shortcut label. */
function useShortcut() {
  const { isMac } = usePlatform();
  return (mac: string, win: string) => (isMac ? mac : win);
}

const CATEGORY_ORDER = [
  "layout",
  "text",
  "media",
  "data",
  "navigation",
  "interactive",
  "custom",
] as const;

function InsertMenuItems() {
  const grouped = new Map<string, typeof CORE_BLOCK_MANIFESTS>();
  for (const m of CORE_BLOCK_MANIFESTS) {
    const list = grouped.get(m.category) ?? [];
    list.push(m);
    grouped.set(m.category, list);
  }

  return (
    <>
      {CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => (
        <MenubarSub key={category}>
          <MenubarSubTrigger className="capitalize">{category}</MenubarSubTrigger>
          <MenubarSubContent>
            {grouped.get(category)!.map((m) => (
              <MenubarItem key={m.type}>
                {resolveLocalizedValue(m.label, VIEWER_CTX) ?? m.type}
              </MenubarItem>
            ))}
          </MenubarSubContent>
        </MenubarSub>
      ))}
    </>
  );
}

function SaveSettingsContent() {
  const { t } = useTranslation(["content_pages"]);
  const autoSaveEnabled = useEditorStore((s) => s.autoSaveEnabled);
  const autoSaveIntervalSec = useEditorStore((s) => s.autoSaveIntervalSec);
  const saveOnBlur = useEditorStore((s) => s.saveOnBlur);
  const setAutoSaveEnabled = useEditorStore((s) => s.setAutoSaveEnabled);
  const setAutoSaveIntervalSec = useEditorStore((s) => s.setAutoSaveIntervalSec);
  const setSaveOnBlur = useEditorStore((s) => s.setSaveOnBlur);

  return (
    <div className="flex w-52 flex-col gap-2.5">
      <p className="text-caption font-medium">
        {t("content_pages:EDITOR_V2_SAVE_SETTINGS_TITLE", { defaultValue: "Save settings" })}
      </p>
      <Checkbox checked={autoSaveEnabled} onChange={(e) => setAutoSaveEnabled(e.target.checked)}>
        <span className="text-caption">
          {t("content_pages:EDITOR_V2_SAVE_SETTINGS_AUTO_SAVE", { defaultValue: "Auto-save" })}
        </span>
      </Checkbox>
      <label className="flex items-center gap-2 text-caption">
        <span className="w-20 shrink-0 text-label-secondary">
          {t("content_pages:EDITOR_V2_SAVE_SETTINGS_INTERVAL", { defaultValue: "Interval (sec)" })}
        </span>
        <InputNumber
          size="small"
          className="flex-1"
          min={10}
          max={300}
          step={10}
          value={autoSaveIntervalSec}
          disabled={!autoSaveEnabled}
          onChange={(val) => {
            if (val != null) setAutoSaveIntervalSec(val);
          }}
        />
      </label>
      <Checkbox checked={saveOnBlur} onChange={(e) => setSaveOnBlur(e.target.checked)}>
        <span className="text-caption">
          {t("content_pages:EDITOR_V2_SAVE_SETTINGS_SAVE_ON_BLUR", {
            defaultValue: "Save on blur",
          })}
        </span>
      </Checkbox>
    </div>
  );
}

function EditorUserMenuContent() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId } = useEditorConfig();
  const [showLangSub, setShowLangSub] = useState(false);
  const [showThemeSub, setShowThemeSub] = useState(false);

  const locale = usePreferencesStore((s) => s.locale);
  const setLocale = usePreferencesStore((s) => s.setLocale);
  const themeMode = usePreferencesStore((s) => s.themeMode);

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
          <span className="flex-1 text-left">
            {t("content_pages:EDITOR_V2_USER_MENU_LANGUAGE", { defaultValue: "Language" })}
          </span>
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
                <span className="flex-1 text-left">{loc === "zh-CN" ? "简体中文" : "English"}</span>
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
          <span className="flex-1 text-left">
            {t("content_pages:EDITOR_V2_USER_MENU_THEME", { defaultValue: "Appearance" })}
          </span>
          <ChevronRight className="size-3.5 text-label-secondary" />
        </button>
        {showThemeSub && (
          <div className="py-0.5 pl-6">
            {(["light", "dark", "system"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={menuItemClass}
                onClick={() => void toggleThemeModeWithTransition({ direction: "ltr" })}
              >
                <span className="flex-1 text-left">
                  {t(`content_pages:EDITOR_V2_USER_MENU_THEME_${m.toUpperCase()}` as const, {
                    defaultValue: m,
                  })}
                </span>
                {themeMode === m && <Check className="size-3.5 text-primary" />}
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
          <span className="flex-1 text-left">
            {t("content_pages:EDITOR_V2_USER_MENU_EXIT", { defaultValue: "Exit editor" })}
          </span>
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

export function EditorHeader() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId } = useEditorConfig();
  const { portal } = useEditorBridgeContext();
  const sc = useShortcut();

  const isDirty = useEditorStore((s) => s.isDirty);
  const isSaving = useEditorStore((s) => s.isSaving);
  const isPublishing = useEditorStore((s) => s.isPublishing);
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const zoomPercent = useEditorStore((s) => s.zoomPercent);
  const setZoomPercent = useEditorStore((s) => s.setZoomPercent);
  const showLineGuides = useEditorStore((s) => s.showLineGuides);
  const setShowLineGuides = useEditorStore((s) => s.setShowLineGuides);

  const { saveDraft, publish } = useEditorSaveContext();

  const handleSave = async () => {
    if (!portal) return;
    const doc = await portal.getDocument();
    await saveDraft(doc);
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-card px-3">
      {/* Left: Logo + MenuBar */}
      <div className="flex items-center gap-2">
        <AdminLogo size={28} ariaLabel="Celestial" to={`/w/${workspaceId}`} />

        <Menubar className="border-none bg-transparent text-callout shadow-none">
          {/* File menu */}
          <MenubarMenu>
            <MenubarTrigger>
              {t("content_pages:EDITOR_V2_MENU_FILE", { defaultValue: "File" })}
              <span className="ml-0.5 text-label-secondary">(F)</span>
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem disabled={!isDirty || isSaving} onClick={handleSave}>
                {t("content_pages:EDITOR_V2_MENU_FILE_SAVE", { defaultValue: "Save" })}
                <MenubarShortcut>{sc("⌘S", "Ctrl+S")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem
                disabled={isPublishing || bridgeStatus !== "connected"}
                onClick={() => void publish()}
              >
                {t("content_pages:EDITOR_V2_MENU_FILE_PUBLISH", { defaultValue: "Publish" })}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                {t("content_pages:EDITOR_V2_MENU_FILE_EXPORT", { defaultValue: "Export" })}
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem
                onClick={() => {
                  window.location.href = `/w/${workspaceId}`;
                }}
              >
                {t("content_pages:EDITOR_V2_MENU_FILE_EXIT", { defaultValue: "Exit editor" })}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* Edit menu */}
          <MenubarMenu>
            <MenubarTrigger>
              {t("content_pages:EDITOR_V2_MENU_EDIT", { defaultValue: "Edit" })}
              <span className="ml-0.5 text-label-secondary">(E)</span>
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => void portal?.undo()}>
                {t("content_pages:EDITOR_V2_MENU_EDIT_UNDO", { defaultValue: "Undo" })}
                <MenubarShortcut>{sc("⌘Z", "Ctrl+Z")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => void portal?.redo()}>
                {t("content_pages:EDITOR_V2_MENU_EDIT_REDO", { defaultValue: "Redo" })}
                <MenubarShortcut>{sc("⇧⌘Z", "Ctrl+Shift+Z")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                {t("content_pages:EDITOR_V2_MENU_EDIT_COPY", { defaultValue: "Copy" })}
                <MenubarShortcut>{sc("⌘C", "Ctrl+C")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                {t("content_pages:EDITOR_V2_MENU_EDIT_PASTE", { defaultValue: "Paste" })}
                <MenubarShortcut>{sc("⌘V", "Ctrl+V")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem>
                {t("content_pages:EDITOR_V2_MENU_EDIT_DELETE", { defaultValue: "Delete" })}
                <MenubarShortcut>{sc("⌫", "Del")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem>
                {t("content_pages:EDITOR_V2_MENU_EDIT_DUPLICATE", { defaultValue: "Duplicate" })}
                <MenubarShortcut>{sc("⌘D", "Ctrl+D")}</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* View menu */}
          <MenubarMenu>
            <MenubarTrigger>
              {t("content_pages:EDITOR_V2_MENU_VIEW", { defaultValue: "View" })}
              <span className="ml-0.5 text-label-secondary">(V)</span>
            </MenubarTrigger>
            <MenubarContent>
              <MenubarItem onClick={() => setZoomPercent(zoomPercent + 10)}>
                {t("content_pages:EDITOR_V2_MENU_VIEW_ZOOM_IN", { defaultValue: "Zoom in" })}
                <MenubarShortcut>{sc("⌘+", "Ctrl++")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => setZoomPercent(zoomPercent - 10)}>
                {t("content_pages:EDITOR_V2_MENU_VIEW_ZOOM_OUT", { defaultValue: "Zoom out" })}
                <MenubarShortcut>{sc("⌘-", "Ctrl+-")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem onClick={() => setZoomPercent(100)}>
                {t("content_pages:EDITOR_V2_MENU_VIEW_ZOOM_RESET", { defaultValue: "Reset zoom" })}
                <MenubarShortcut>{sc("⌘0", "Ctrl+0")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem onClick={() => setShowLineGuides(!showLineGuides)}>
                {t("content_pages:EDITOR_V2_MENU_VIEW_GUIDES", { defaultValue: "Toggle guides" })}
              </MenubarItem>
              <MenubarItem>
                {t("content_pages:EDITOR_V2_MENU_VIEW_BOUNDS", { defaultValue: "Toggle bounds" })}
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          {/* Insert menu */}
          <MenubarMenu>
            <MenubarTrigger>
              {t("content_pages:EDITOR_V2_MENU_INSERT", { defaultValue: "Insert" })}
              <span className="ml-0.5 text-label-secondary">(I)</span>
            </MenubarTrigger>
            <MenubarContent>
              <InsertMenuItems />
            </MenubarContent>
          </MenubarMenu>
        </Menubar>
      </div>

      {/* Right: Save + Publish + Avatar */}
      <div className="flex items-center gap-2">
        <BridgeStatusIndicator />

        {/* Save with settings popover */}
        <Space.Compact>
          <Tooltip title={t("content_pages:EDITOR_V2_TOOLBAR_SAVE", { defaultValue: "Save" })}>
            <Button
              type={isDirty ? "primary" : "default"}
              disabled={isSaving || !isDirty}
              icon={<Save className="size-3.5" />}
              onClick={handleSave}
            />
          </Tooltip>
          <Popover content={<SaveSettingsContent />} trigger="click" placement="bottomRight">
            <Button icon={<ChevronDown className="size-3" />} />
          </Popover>
        </Space.Compact>

        {/* Publish */}
        <Button
          type="primary"
          disabled={isPublishing || bridgeStatus !== "connected"}
          icon={<Globe className="size-3.5" />}
          onClick={() => void publish()}
        >
          {t("content_pages:EDITOR_V2_TOOLBAR_PUBLISH", { defaultValue: "Publish" })}
        </Button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-border" />

        {/* Avatar with FloatingPanel user menu */}
        <FloatingPanelRoot>
          <FloatingPanelTrigger
            title={t("content_pages:EDITOR_V2_USER_MENU_TITLE", { defaultValue: "User menu" })}
            className="size-8 justify-center rounded-full border-0 bg-transparent"
          >
            <Avatar icon={<User className="size-3.5" />} />
          </FloatingPanelTrigger>
          <FloatingPanelContent placement="bottom" className="w-auto">
            <FloatingPanelBody className="p-0">
              <EditorUserMenuContent />
            </FloatingPanelBody>
          </FloatingPanelContent>
        </FloatingPanelRoot>
      </div>
    </header>
  );
}
