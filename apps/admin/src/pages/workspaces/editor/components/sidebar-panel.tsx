import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "antd";
import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";

import {
  useEditorStore,
  type ActivityBarMenuId,
} from "@/pages/workspaces/editor/stores/editor-store";
import {
  EDITOR_MENU_DESC_KEYS,
  EDITOR_MENU_TITLE_KEYS,
} from "@/pages/workspaces/editor/constants/menus";
import { PagesPanel } from "@/pages/workspaces/editor/panels/pages-panel";
import { NavigatorPanel } from "@/pages/workspaces/editor/panels/navigator-panel";
import { ComponentsPanel } from "@/pages/workspaces/editor/panels/components-panel";
import { BlocksPanel } from "@/pages/workspaces/editor/panels/blocks-panel";
import { AssetsPanel } from "@/pages/workspaces/editor/panels/assets-panel";
import { SearchPanel } from "@/pages/workspaces/editor/panels/search-panel";
import { EditorSettingsPanel } from "@/pages/workspaces/editor/panels/editor-settings-panel";

function PanelContent({ menuId, t }: { menuId: ActivityBarMenuId; t: (key: string) => string }) {
  switch (menuId) {
    case "pages":
      return <PagesPanel />;
    case "navigator":
      return <NavigatorPanel />;
    case "add-elements":
      return <ComponentsPanel />;
    case "blocks":
      return <BlocksPanel />;
    case "assets":
      return <AssetsPanel />;
    case "search":
      return <SearchPanel />;
    case "settings":
      return <EditorSettingsPanel />;
    case "plugins":
      return (
        <div className="flex flex-1 items-center justify-center p-4">
          <span className="text-caption text-label-secondary">
            {t("content_pages:EDITOR_COMING_SOON")}
          </span>
        </div>
      );
  }
}

export function SidebarPanel() {
  const { t } = useTranslation(["content_pages"]);
  const activeMenuId = useEditorStore((s) => s.activeMenuId);
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);
  const sidebarWidthByMenu = useEditorStore((s) => s.sidebarWidthByMenu);
  const setSidebarWidth = useEditorStore((s) => s.setSidebarWidth);

  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const isVisible = sidebarOpen && activeMenuId !== null;
  const titleKey = activeMenuId ? EDITOR_MENU_TITLE_KEYS[activeMenuId] : null;
  const descKey = activeMenuId ? EDITOR_MENU_DESC_KEYS[activeMenuId] : null;
  const sidebarWidth = activeMenuId ? (sidebarWidthByMenu[activeMenuId] ?? 280) : 280;

  return (
    <AnimatePresence initial={false}>
      {isVisible && activeMenuId ? (
        <motion.aside
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: sidebarWidth, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className="relative flex shrink-0 flex-col overflow-hidden border-r bg-card"
        >
          {/* Header */}
          <div className="flex shrink-0 items-start justify-between border-b px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-caption font-medium">{titleKey ? t(titleKey) : ""}</span>
              <span className="text-caption text-label-secondary">{descKey ? t(descKey) : ""}</span>
            </div>
            <Button
              type="text"
              size="small"
              icon={<X className="size-3.5" />}
              onClick={toggleSidebar}
              className="ml-1 mt-0.5 shrink-0"
            />
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <PanelContent menuId={activeMenuId} t={t} />
          </div>

          {/* Resize handle */}
          <div
            role="separator"
            aria-orientation="vertical"
            className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
            onPointerDown={(e) => {
              if (!activeMenuId) return;
              resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              e.preventDefault();
            }}
            onPointerMove={(e) => {
              if (!activeMenuId) return;
              if (!resizeRef.current) return;
              const nextWidth =
                resizeRef.current.startWidth + (e.clientX - resizeRef.current.startX);
              setSidebarWidth(activeMenuId, nextWidth);
            }}
            onPointerUp={(e) => {
              resizeRef.current = null;
              const el = e.currentTarget as HTMLElement;
              if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
            }}
            onPointerCancel={(e) => {
              resizeRef.current = null;
              const el = e.currentTarget as HTMLElement;
              if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
            }}
          >
            <div className="absolute right-0 top-0 h-full w-px bg-border opacity-0 transition-opacity hover:opacity-100" />
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
