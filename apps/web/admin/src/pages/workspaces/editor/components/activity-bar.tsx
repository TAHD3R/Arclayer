import { useTranslation } from "react-i18next";
import { Plus, Layers, FileText, Image, Blocks, Puzzle, Settings, Search } from "lucide-react";
import { Tooltip } from "antd";

import {
  useEditorStore,
  type ActivityBarMenuId,
} from "@/pages/workspaces/editor/stores/editor-store";
import { EDITOR_MENU_TITLE_KEYS } from "@/pages/workspaces/editor/constants/menus";
import { cn } from "@/lib/utils";

type MenuEntry = {
  id: ActivityBarMenuId;
  icon: typeof FileText;
};

/* Main menu items */
const MAIN_ITEMS: MenuEntry[] = [
  {
    id: "add-elements",
    icon: Plus,
  },
  {
    id: "navigator",
    icon: Layers,
  },
  { id: "pages", icon: FileText },
  { id: "assets", icon: Image },
  { id: "blocks", icon: Blocks },
  { id: "plugins", icon: Puzzle },
];

/* Bottom pinned items */
const BOTTOM_ITEMS: MenuEntry[] = [
  { id: "search", icon: Search },
  { id: "settings", icon: Settings },
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
  const label = t(EDITOR_MENU_TITLE_KEYS[entry.id]);

  return (
    <Tooltip title={label} placement="right">
      <button
        type="button"
        className={cn(
          "flex size-10 items-center justify-center rounded-md transition-all hover:scale-105",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-label-secondary hover:bg-muted hover:text-foreground",
        )}
        onClick={onClick}
        aria-label={label}
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

      {/* Flexible spacer */}
      <div className="flex-1" />

      {/* Bottom pinned items */}
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
