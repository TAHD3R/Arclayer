import { useTranslation } from "react-i18next";
import {
  FileText,
  Layers,
  LayoutGrid,
  Blocks,
  Image,
  Puzzle,
  Settings,
  Search,
} from "lucide-react";
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

const MAIN_ITEMS: MenuEntry[] = [
  { id: "pages", icon: FileText, labelKey: "EDITOR_V2_MENU_PAGES", defaultValue: "Pages" },
  {
    id: "navigator",
    icon: Layers,
    labelKey: "EDITOR_V2_MENU_NAVIGATOR",
    defaultValue: "Navigator",
  },
  {
    id: "components",
    icon: LayoutGrid,
    labelKey: "EDITOR_V2_MENU_COMPONENTS",
    defaultValue: "Components",
  },
  { id: "blocks", icon: Blocks, labelKey: "EDITOR_V2_MENU_BLOCKS", defaultValue: "Block patterns" },
  { id: "assets", icon: Image, labelKey: "EDITOR_V2_MENU_ASSETS", defaultValue: "Assets" },
];

const PLUGIN_ITEM: MenuEntry = {
  id: "plugins",
  icon: Puzzle,
  labelKey: "EDITOR_V2_MENU_PLUGINS",
  defaultValue: "Plugins",
};

const BOTTOM_ITEMS: MenuEntry[] = [
  { id: "settings", icon: Settings, labelKey: "EDITOR_V2_MENU_SETTINGS", defaultValue: "Settings" },
  { id: "search", icon: Search, labelKey: "EDITOR_V2_MENU_SEARCH", defaultValue: "Find anything" },
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
        className={`flex size-10 items-center justify-center rounded-md transition-colors ${
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
      {/* Main menu items */}
      {MAIN_ITEMS.map((entry) => (
        <BarButton
          key={entry.id}
          entry={entry}
          isActive={activeMenuId === entry.id}
          onClick={() => setActiveMenuId(entry.id)}
        />
      ))}

      {/* Separator + Plugins */}
      <div className="mx-2 my-1 h-px w-6 bg-border" />
      <BarButton
        entry={PLUGIN_ITEM}
        isActive={activeMenuId === "plugins"}
        onClick={() => setActiveMenuId("plugins")}
      />

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom items */}
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
