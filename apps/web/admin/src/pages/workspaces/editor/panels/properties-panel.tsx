import { useTranslation } from "react-i18next";
import { LayoutDashboard, Palette, Settings2, Sparkles } from "lucide-react";
import { Tooltip } from "antd";

import type { EditorSelectionInspector } from "@celestial/site-editor-protocol";

import {
  useEditorStore,
  type PropertiesPanelTab,
} from "@/pages/workspaces/editor/stores/editor-store";
import { InspectorComponent } from "@/pages/workspaces/editor/panels/inspector-component";
import { InspectorLayout } from "@/pages/workspaces/editor/panels/inspector-layout";
import { InspectorDesign } from "@/pages/workspaces/editor/panels/inspector-design";
import { InspectorAnimation } from "@/pages/workspaces/editor/panels/inspector-animation";

const TABS: {
  id: PropertiesPanelTab;
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

function TabContent({
  tab,
  inspector,
}: {
  tab: PropertiesPanelTab;
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

export function PropertiesPanel() {
  const { t } = useTranslation(["content_pages"]);
  const tab = useEditorStore((s) => s.propertiesPanelTab);
  const setTab = useEditorStore((s) => s.setPropertiesPanelTab);
  const propertiesPanelOpen = useEditorStore((s) => s.propertiesPanelOpen);
  const togglePropertiesPanel = useEditorStore((s) => s.togglePropertiesPanel);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const inspectorData = useEditorStore((s) => s.inspectorData);

  const activeTab = TABS.find((t) => t.id === tab);

  return (
    <>
      {/* Panel content (left of bar) */}
      {propertiesPanelOpen && (
        <aside className="flex h-full w-64 shrink-0 flex-col border-l bg-card">
          <div className="flex h-10 items-center border-b px-3">
            <span className="text-xs font-medium">
              {activeTab
                ? t(`content_pages:${activeTab.labelKey}`, { defaultValue: activeTab.defaultValue })
                : t("content_pages:EDITOR_V2_RIGHT_TITLE", { defaultValue: "Inspector" })}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
            {selectedBlockId ? (
              <TabContent tab={tab} inspector={inspectorData} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("content_pages:EDITOR_V2_INSPECTOR_EMPTY", {
                  defaultValue: "Select an element to inspect its properties.",
                })}
              </p>
            )}
          </div>
        </aside>
      )}

      {/* Vertical tab bar (rightmost) */}
      <aside className="flex w-10 shrink-0 flex-col items-center gap-1 border-l bg-card py-2">
        {TABS.map(({ id, icon: Icon, labelKey, defaultValue }) => {
          const isActive = propertiesPanelOpen && tab === id;
          return (
            <Tooltip
              key={id}
              title={t(`content_pages:${labelKey}`, { defaultValue })}
              placement="left"
            >
              <button
                type="button"
                className={`flex size-8 items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                onClick={() => {
                  if (tab === id && propertiesPanelOpen) {
                    togglePropertiesPanel();
                  } else {
                    setTab(id);
                  }
                }}
              >
                <Icon className="size-4" />
              </button>
            </Tooltip>
          );
        })}
      </aside>
    </>
  );
}
