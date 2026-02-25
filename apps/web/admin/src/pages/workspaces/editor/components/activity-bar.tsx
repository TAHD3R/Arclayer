import { useTranslation } from "react-i18next";
import { Plus, Layers, FileText, Image, Blocks, Puzzle, Settings, Search } from "lucide-react";
import { Tooltip } from "antd";

import {
  useEditorStore,
  type ActivityBarMenuId,
} from "@/pages/workspaces/editor/stores/editor-store";

type MenuEntry = {
  id: ActivityBarMenuId;
  icon: typeof FileText;
  labelKey: string;
  defaultValue: string;
};

/* 主菜单项 — 按新顺序排列，plugins 已合并进来 */
const MAIN_ITEMS: MenuEntry[] = [
  {
    id: "add-elements",
    icon: Plus,
    labelKey: "EDITOR_V2_MENU_ADD_ELEMENTS",
    defaultValue: "Add Elements",
  },
  {
    id: "navigator",
    icon: Layers,
    labelKey: "EDITOR_V2_MENU_NAVIGATOR",
    defaultValue: "Navigator",
  },
  { id: "pages", icon: FileText, labelKey: "EDITOR_V2_MENU_PAGES", defaultValue: "Pages" },
  { id: "assets", icon: Image, labelKey: "EDITOR_V2_MENU_ASSETS", defaultValue: "Assets" },
  { id: "blocks", icon: Blocks, labelKey: "EDITOR_V2_MENU_BLOCKS", defaultValue: "Blocks" },
  { id: "plugins", icon: Puzzle, labelKey: "EDITOR_V2_MENU_PLUGINS", defaultValue: "Plugins" },
];

/* 底部固定项 */
const BOTTOM_ITEMS: MenuEntry[] = [
  { id: "search", icon: Search, labelKey: "EDITOR_V2_MENU_SEARCH", defaultValue: "Find anything" },
  { id: "settings", icon: Settings, labelKey: "EDITOR_V2_MENU_SETTINGS", defaultValue: "Settings" },
];

function BarButton({
  entry,
  isActive,
  onClick,
}: {
  entry: MenuEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation(["content_pages"]);
  const Icon = entry.icon;

  return (
    <Tooltip
      title={t(`content_pages:${entry.labelKey}`, { defaultValue: entry.defaultValue })}
      placement="right"
    >
      <button
        type="button"
        className={`flex size-10 items-center justify-center rounded-md transition-all hover:scale-105 ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-label-secondary hover:bg-muted hover:text-foreground"
        }`}
        onClick={onClick}
        aria-label={t(`content_pages:${entry.labelKey}`, { defaultValue: entry.defaultValue })}
      >
        <Icon className="size-5" />
      </button>
    </Tooltip>
  );
}

export function ActivityBar() {
  const activeMenuId = useEditorStore((s) => s.activeMenuId);
  const setActiveMenuId = useEditorStore((s) => s.setActiveMenuId);

  return (
    <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r bg-card py-2">
      {/* 主菜单项 */}
      {MAIN_ITEMS.map((entry) => (
        <BarButton
          key={entry.id}
          entry={entry}
          isActive={activeMenuId === entry.id}
          onClick={() => setActiveMenuId(entry.id)}
        />
      ))}

      {/* 弹性间隔 */}
      <div className="flex-1" />

      {/* 底部固定项 */}
      {BOTTOM_ITEMS.map((entry) => (
        <BarButton
          key={entry.id}
          entry={entry}
          isActive={activeMenuId === entry.id}
          onClick={() => setActiveMenuId(entry.id)}
        />
      ))}
    </aside>
  );
}
