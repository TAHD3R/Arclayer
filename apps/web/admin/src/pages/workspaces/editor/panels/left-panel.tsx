import { useTranslation } from "react-i18next";
import { FileText, Image, LayoutGrid, Layers } from "lucide-react";

import { useEditorStore, type LeftPanelTab } from "@/pages/workspaces/editor/stores/editor-store";
import { ElementsPanel } from "@/pages/workspaces/editor/panels/elements-panel";
import { LayersPanel } from "@/pages/workspaces/editor/panels/layers-panel";
import { PagesPanel } from "@/pages/workspaces/editor/panels/pages-panel";
import { AssetsPanel } from "@/pages/workspaces/editor/panels/assets-panel";

const TABS: {
  id: LeftPanelTab;
  icon: typeof LayoutGrid;
  labelKey: string;
  defaultValue: string;
}[] = [
  {
    id: "elements",
    icon: LayoutGrid,
    labelKey: "EDITOR_V2_TAB_ELEMENTS",
    defaultValue: "Elements",
  },
  { id: "layers", icon: Layers, labelKey: "EDITOR_V2_TAB_LAYERS", defaultValue: "Layers" },
  { id: "pages", icon: FileText, labelKey: "EDITOR_V2_TAB_PAGES", defaultValue: "Pages" },
  { id: "assets", icon: Image, labelKey: "EDITOR_V2_TAB_ASSETS", defaultValue: "Assets" },
];

function TabContent({ tab }: { tab: LeftPanelTab }) {
  switch (tab) {
    case "elements":
      return <ElementsPanel />;
    case "layers":
      return <LayersPanel />;
    case "pages":
      return <PagesPanel />;
    case "assets":
      return <AssetsPanel />;
  }
}

export function LeftPanel() {
  const { t } = useTranslation(["content_pages"]);
  const tab = useEditorStore((s) => s.leftPanelTab);
  const setTab = useEditorStore((s) => s.setLeftPanelTab);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-card">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(({ id, icon: Icon, labelKey, defaultValue }) => (
          <button
            key={id}
            type="button"
            title={t(`content_pages:${labelKey}`, { defaultValue })}
            className={`flex flex-1 items-center justify-center py-2 ${tab === id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setTab(id)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <TabContent tab={tab} />
      </div>
    </aside>
  );
}
