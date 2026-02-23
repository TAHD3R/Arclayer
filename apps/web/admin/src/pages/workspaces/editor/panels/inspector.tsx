import { useTranslation } from "react-i18next";
import { LayoutDashboard, Palette, Settings2, Sparkles } from "lucide-react";

import type { EditorSelectionInspector } from "@celestial/site-editor-protocol";

import { useEditorStore, type RightPanelTab } from "@/pages/workspaces/editor/stores/editor-store";
import { InspectorComponent } from "@/pages/workspaces/editor/panels/inspector-component";
import { InspectorLayout } from "@/pages/workspaces/editor/panels/inspector-layout";
import { InspectorDesign } from "@/pages/workspaces/editor/panels/inspector-design";
import { InspectorAnimation } from "@/pages/workspaces/editor/panels/inspector-animation";

const TABS: {
  id: RightPanelTab;
  icon: typeof Settings2;
  labelKey: string;
  defaultValue: string;
}[] = [
  {
    id: "component",
    icon: Settings2,
    labelKey: "EDITOR_V2_TAB_COMPONENT",
    defaultValue: "Component",
  },
  { id: "layout", icon: LayoutDashboard, labelKey: "EDITOR_V2_TAB_LAYOUT", defaultValue: "Layout" },
  { id: "design", icon: Palette, labelKey: "EDITOR_V2_TAB_DESIGN", defaultValue: "Design" },
  {
    id: "animation",
    icon: Sparkles,
    labelKey: "EDITOR_V2_TAB_ANIMATION",
    defaultValue: "Animation",
  },
];

// Temporary mock — will be replaced by RPC bridge data
const EMPTY_INSPECTOR: EditorSelectionInspector = {
  blockId: null,
  blockType: null,
  component: {},
  layout: {},
  design: {},
  animation: {},
};

function TabContent({
  tab,
  inspector,
}: {
  tab: RightPanelTab;
  inspector: EditorSelectionInspector;
}) {
  switch (tab) {
    case "component":
      return inspector.blockType ? (
        <InspectorComponent blockType={inspector.blockType} data={inspector.component} />
      ) : null;
    case "layout":
      return <InspectorLayout data={inspector.layout} />;
    case "design":
      return <InspectorDesign data={inspector.design} />;
    case "animation":
      return <InspectorAnimation data={inspector.animation} />;
  }
}

export function Inspector() {
  const { t } = useTranslation(["content_pages"]);
  const tab = useEditorStore((s) => s.rightPanelTab);
  const setTab = useEditorStore((s) => s.setRightPanelTab);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);

  // TODO: replace with real inspector data from RPC bridge
  const inspector = EMPTY_INSPECTOR;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l bg-card">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(({ id, icon: Icon, labelKey, defaultValue }) => (
          <button
            key={id}
            type="button"
            title={t(`content_pages:${labelKey}`, { defaultValue })}
            className={`flex flex-1 items-center justify-center py-2 ${
              tab === id
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(id)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        {selectedBlockId ? (
          <TabContent tab={tab} inspector={inspector} />
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("content_pages:EDITOR_V2_INSPECTOR_EMPTY", {
              defaultValue: "Select an element to inspect its properties",
            })}
          </p>
        )}
      </div>
    </aside>
  );
}
