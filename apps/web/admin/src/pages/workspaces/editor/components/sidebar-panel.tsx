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

/* 面板标题与描述映射 */
type PanelTitleEntry = {
  key: string;
  defaultValue: string;
  descKey: string;
  descDefault: string;
};

const PANEL_TITLES: Record<ActivityBarMenuId, PanelTitleEntry> = {
  "add-elements": {
    key: "EDITOR_V2_PANEL_ADD_ELEMENTS",
    defaultValue: "Add Elements",
    descKey: "EDITOR_V2_PANEL_ADD_ELEMENTS_DESC",
    descDefault: "Drag blocks onto the canvas to build your page",
  },
  navigator: {
    key: "EDITOR_V2_PANEL_NAVIGATOR",
    defaultValue: "Navigator",
    descKey: "EDITOR_V2_PANEL_NAVIGATOR_DESC",
    descDefault: "View and reorder the layer hierarchy",
  },
  pages: {
    key: "EDITOR_V2_PANEL_PAGES",
    defaultValue: "Pages",
    descKey: "EDITOR_V2_PANEL_PAGES_DESC",
    descDefault: "Manage and switch between site pages",
  },
  assets: {
    key: "EDITOR_V2_PANEL_ASSETS",
    defaultValue: "Assets",
    descKey: "EDITOR_V2_PANEL_ASSETS_DESC",
    descDefault: "Upload and manage media files",
  },
  blocks: {
    key: "EDITOR_V2_PANEL_BLOCKS",
    defaultValue: "Blocks",
    descKey: "EDITOR_V2_PANEL_BLOCKS_DESC",
    descDefault: "Reusable component collections",
  },
  plugins: {
    key: "EDITOR_V2_PANEL_PLUGINS",
    defaultValue: "Plugins",
    descKey: "EDITOR_V2_PANEL_PLUGINS_DESC",
    descDefault: "Extend editor functionality",
  },
  settings: {
    key: "EDITOR_V2_PANEL_SETTINGS",
    defaultValue: "Settings",
    descKey: "EDITOR_V2_PANEL_SETTINGS_DESC",
    descDefault: "Configure editor preferences",
  },
  search: {
    key: "EDITOR_V2_PANEL_SEARCH",
    defaultValue: "Find anything",
    descKey: "EDITOR_V2_PANEL_SEARCH_DESC",
    descDefault: "Search across pages and blocks",
  },
};

function PanelContent({ menuId }: { menuId: ActivityBarMenuId }) {
  switch (menuId) {
    case "pages":
      return <PagesPanel />;
    case "navigator":
      return <NavigatorPanel />;
    case "add-elements":
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
          <span className="text-caption text-label-secondary">Plugins coming soon</span>
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
          {/* Header — 自适应高度，包含标题与描述 */}
          <div className="flex shrink-0 items-start justify-between border-b px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-caption font-medium">
                {titleInfo
                  ? t(`content_pages:${titleInfo.key}`, { defaultValue: titleInfo.defaultValue })
                  : ""}
              </span>
              {titleInfo && (
                <span className="text-caption text-label-secondary">
                  {t(`content_pages:${titleInfo.descKey}`, {
                    defaultValue: titleInfo.descDefault,
                  })}
                </span>
              )}
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
            <PanelContent menuId={activeMenuId} />
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
