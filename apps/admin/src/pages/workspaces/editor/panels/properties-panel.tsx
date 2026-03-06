import { useTranslation } from "react-i18next";
import { LayoutDashboard, Palette, Settings2, Sparkles } from "lucide-react";
import { Button, Input, Select, Tooltip } from "antd";
import { AnimatePresence, motion } from "motion/react";

import type { EditorSelectionInspector } from "@celestial/editor-protocol";

import { cn } from "@celestial/lib/utils";
import { Button as ButtonPrimitive } from "@celestial/ui/button-primitive";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useRequestEditContentRef } from "@/pages/workspaces/editor/hooks/use-editor-bridge";
import { useEditorSelectionPatch } from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";
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
}[] = [
  {
    id: "component",
    icon: Settings2,
    labelKey: "EDITOR_TAB_COMPONENT",
  },
  { id: "layout", icon: LayoutDashboard, labelKey: "EDITOR_TAB_LAYOUT" },
  { id: "design", icon: Palette, labelKey: "EDITOR_TAB_DESIGN" },
  {
    id: "animation",
    icon: Sparkles,
    labelKey: "EDITOR_TAB_ANIMATION",
  },
];

const TAB_DESC_KEYS: Record<PropertiesPanelTab, string> = {
  component: "EDITOR_PROPERTIES_DESC_COMPONENT",
  layout: "EDITOR_PROPERTIES_DESC_LAYOUT",
  design: "EDITOR_PROPERTIES_DESC_DESIGN",
  animation: "EDITOR_PROPERTIES_DESC_ANIMATION",
} as const;

type ContentRefState = "auto" | "draft" | "published";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isContentRefState(value: unknown): value is ContentRefState {
  return value === "auto" || value === "draft" || value === "published";
}

function InspectorContentRef(props: { data: EditorSelectionInspector }) {
  const { t } = useTranslation(["content_pages"]);
  const patchSelection = useEditorSelectionPatch();
  const { workspaceId } = useEditorConfig();
  const requestEditContentRef = useRequestEditContentRef({ workspaceId });

  const component = props.data.component;
  const refEntryId =
    isRecord(component) && typeof component.refEntryId === "string" ? component.refEntryId : "";
  const refState: ContentRefState =
    isRecord(component) && isContentRefState(component.refState) ? component.refState : "auto";

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-medium text-label-secondary">
        {t("content_pages:EDITOR_CONTENT_REF_TITLE")}
      </p>

      <label className="flex items-center gap-2 text-caption">
        <span className="w-24 shrink-0 text-label-secondary">
          {t("content_pages:EDITOR_CONTENT_REF_FIELD_ENTRY_ID")}
        </span>
        <Input size="small" value={refEntryId} readOnly />
      </label>

      <label className="flex items-center gap-2 text-caption">
        <span className="w-24 shrink-0 text-label-secondary">
          {t("content_pages:EDITOR_CONTENT_REF_FIELD_STATE")}
        </span>
        <Select<ContentRefState>
          size="small"
          className="flex-1"
          value={refState}
          onChange={(val) => {
            void patchSelection("component", { refState: val }, { commit: "immediate" });
          }}
          options={[
            { value: "auto", label: t("content_pages:EDITOR_CONTENT_REF_STATE_AUTO") },
            { value: "draft", label: t("content_pages:EDITOR_CONTENT_REF_STATE_DRAFT") },
            { value: "published", label: t("content_pages:EDITOR_CONTENT_REF_STATE_PUBLISHED") },
          ]}
        />
      </label>

      <div className="pt-1">
        <Button
          size="small"
          type="default"
          disabled={!refEntryId}
          onClick={() => requestEditContentRef({ refEntryId })}
          autoInsertSpace={false}
        >
          {t("content_pages:EDITOR_CONTENT_REF_ACTION_EDIT")}
        </Button>
      </div>
    </div>
  );
}

function TabContent({
  tab,
  inspector,
}: {
  tab: PropertiesPanelTab;
  inspector: EditorSelectionInspector;
}) {
  switch (tab) {
    case "component":
      if (!inspector.blockType) return null;
      return inspector.blockType === "content_ref" ? (
        <InspectorContentRef data={inspector} />
      ) : (
        <InspectorComponent blockType={inspector.blockType} data={inspector.component} />
      );
    case "layout":
      return <InspectorLayout data={inspector.layout} />;
    case "design":
      return <InspectorDesign data={inspector.design} blockType={inspector.blockType} />;
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
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const inspectorData = useEditorStore((s) => s.inspectorData);

  const activeTab = TABS.find((t) => t.id === tab);

  return (
    <>
      {/* Panel content (left of bar), with slide animation */}
      <AnimatePresence initial={false}>
        {propertiesPanelOpen && (
          <motion.aside
            key="properties"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 256, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeInOut" }}
            className="flex shrink-0 flex-col overflow-hidden border-l bg-card"
          >
            {/* Header */}
            <div className="flex shrink-0 flex-col gap-0.5 border-b px-3 py-2">
              <span className="text-caption font-medium">
                {activeTab
                  ? t(`content_pages:${activeTab.labelKey}`)
                  : t("content_pages:EDITOR_RIGHT_TITLE")}
              </span>
              <span className="text-caption text-label-secondary">
                {selectedBlockId
                  ? t(`content_pages:${TAB_DESC_KEYS[tab]}`)
                  : t("content_pages:EDITOR_SELECT_HINT")}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
              {bridgeStatus !== "connected" ? (
                <div className="mb-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-caption text-label-secondary">
                  {bridgeStatus === "connecting"
                    ? t("content_pages:EDITOR_BRIDGE_CONNECTING_NOTICE")
                    : t("content_pages:EDITOR_BRIDGE_DISCONNECTED_NOTICE")}
                </div>
              ) : null}

              <div
                className={cn(
                  bridgeStatus !== "connected" ? "pointer-events-none opacity-60" : undefined,
                )}
              >
                {selectedBlockId ? (
                  <TabContent tab={tab} inspector={inspectorData} />
                ) : (
                  <p className="text-caption text-label-secondary">
                    {t("content_pages:EDITOR_INSPECTOR_EMPTY")}
                  </p>
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Vertical tab bar (rightmost) */}
      <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-l bg-card py-2">
        {TABS.map(({ id, icon: Icon, labelKey }) => {
          const isActive = propertiesPanelOpen && tab === id;
          return (
            <Tooltip key={id} title={t(`content_pages:${labelKey}`)} placement="left">
              <ButtonPrimitive
                type="button"
                hoverScale={1}
                tapScale={1}
                className={cn(
                  "flex size-10 items-center justify-center rounded-md transition-colors",
                  isActive
                    ? "bg-accent text-primary"
                    : "text-label-secondary hover:bg-accent hover:text-foreground",
                )}
                onClick={() => {
                  if (tab === id && propertiesPanelOpen) {
                    togglePropertiesPanel();
                  } else {
                    setTab(id);
                  }
                }}
              >
                <Icon className="size-5" />
              </ButtonPrimitive>
            </Tooltip>
          );
        })}
      </aside>
    </>
  );
}
