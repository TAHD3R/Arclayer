import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "antd";
import { AnimatePresence, motion } from "motion/react";

import {
  useEditorStore,
  type ActivityBarMenuId,
} from "@/pages/workspaces/editor/stores/editor-store";
import { PagesPanel } from "@/pages/workspaces/editor/panels/pages-panel";
import { NavigatorPanel } from "@/pages/workspaces/editor/panels/navigator-panel";
import { ComponentsPanel } from "@/pages/workspaces/editor/panels/components-panel";
import { BlockPatternsPanel } from "@/pages/workspaces/editor/panels/block-patterns-panel";
import { AssetsPanel } from "@/pages/workspaces/editor/panels/assets-panel";
import { SearchPanel } from "@/pages/workspaces/editor/panels/search-panel";
import { EditorSettingsPanel } from "@/pages/workspaces/editor/panels/editor-settings-panel";

const PANEL_TITLES: Record<ActivityBarMenuId, { key: string; defaultValue: string }> = {
  pages: { key: "EDITOR_V2_PANEL_PAGES", defaultValue: "Pages" },
  navigator: { key: "EDITOR_V2_PANEL_NAVIGATOR", defaultValue: "Navigator" },
  components: { key: "EDITOR_V2_PANEL_COMPONENTS", defaultValue: "Components" },
  blocks: { key: "EDITOR_V2_PANEL_BLOCKS", defaultValue: "Block patterns" },
  assets: { key: "EDITOR_V2_PANEL_ASSETS", defaultValue: "Assets" },
  plugins: { key: "EDITOR_V2_PANEL_PLUGINS", defaultValue: "Plugins" },
  settings: { key: "EDITOR_V2_PANEL_SETTINGS", defaultValue: "Settings" },
  search: { key: "EDITOR_V2_PANEL_SEARCH", defaultValue: "Find anything" },
};

function PanelContent({ menuId }: { menuId: ActivityBarMenuId }) {
  switch (menuId) {
    case "pages":
      return <PagesPanel />;
    case "navigator":
      return <NavigatorPanel />;
    case "components":
      return <ComponentsPanel />;
    case "blocks":
      return <BlockPatternsPanel />;
    case "assets":
      return <AssetsPanel />;
    case "search":
      return <SearchPanel />;
    case "settings":
      return <EditorSettingsPanel />;
    case "plugins":
      return (
        <div className="flex flex-1 items-center justify-center p-4">
          <span className="text-xs text-muted-foreground">Plugins coming soon</span>
        </div>
      );
  }
}

export function SidebarPanel() {
  const { t } = useTranslation(["content_pages"]);
  const activeMenuId = useEditorStore((s) => s.activeMenuId);
  const sidebarOpen = useEditorStore((s) => s.sidebarOpen);
  const toggleSidebar = useEditorStore((s) => s.toggleSidebar);

  const isVisible = sidebarOpen && activeMenuId !== null;
  const titleInfo = activeMenuId ? PANEL_TITLES[activeMenuId] : null;

  return (
    <AnimatePresence initial={false}>
      {isVisible && activeMenuId ? (
        <motion.aside
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 256, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className="flex shrink-0 flex-col overflow-hidden border-r bg-card"
        >
          {/* Header */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
            <span className="text-xs font-medium">
              {titleInfo
                ? t(`content_pages:${titleInfo.key}`, { defaultValue: titleInfo.defaultValue })
                : ""}
            </span>
            <Button
              type="text"
              size="small"
              icon={<X className="size-3.5" />}
              onClick={toggleSidebar}
            />
          </div>

          {/* Content */}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            <PanelContent menuId={activeMenuId} />
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
