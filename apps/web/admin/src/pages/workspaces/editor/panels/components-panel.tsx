import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Input } from "antd";
import { useDraggable } from "@dnd-kit/core";

import {
  CORE_BLOCK_MANIFESTS,
  PREFAB_BLOCK_MANIFESTS,
  resolveLocalizedValue,
  type BlockCategory,
  type BlockManifest,
} from "@celestial/site-block-protocol";

import { getErrorMessage, notifyErrorText } from "@/lib/notifications";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useViewerContext } from "@/pages/workspaces/editor/hooks/use-viewer-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

const CATEGORY_LABEL_KEYS: Record<BlockCategory, string> = {
  layout: "content_pages:EDITOR_BLOCK_CATEGORY_LAYOUT",
  text: "content_pages:EDITOR_BLOCK_CATEGORY_TEXT",
  media: "content_pages:EDITOR_BLOCK_CATEGORY_MEDIA",
  data: "content_pages:EDITOR_BLOCK_CATEGORY_DATA",
  navigation: "content_pages:EDITOR_BLOCK_CATEGORY_NAVIGATION",
  interactive: "content_pages:EDITOR_BLOCK_CATEGORY_INTERACTIVE",
  custom: "content_pages:EDITOR_BLOCK_CATEGORY_CUSTOM",
} as const;

function BlockInsertTile(props: {
  manifest: BlockManifest;
  canInsert: boolean;
  onInsert: () => void;
  label: string;
}) {
  const dnd = useDraggable({
    id: `new-block:${props.manifest.type}`,
    data: { editorItem: { kind: "new-block", blockType: props.manifest.type } },
    disabled: !props.canInsert,
  });

  return (
    <button
      ref={dnd.setNodeRef}
      type="button"
      disabled={!props.canInsert}
      className="flex flex-col items-center gap-1 rounded-md border p-2 text-caption hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
      onClick={props.onInsert}
      {...dnd.listeners}
      {...dnd.attributes}
    >
      <span className="text-[10px] text-label-secondary">
        {props.manifest.icon ?? props.manifest.type}
      </span>
      <span className="truncate">{props.label}</span>
    </button>
  );
}

export function ComponentsPanel() {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();
  const [query, setQuery] = useState("");

  const viewerCtx = useViewerContext();

  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const canInsert = bridgeStatus === "connected" && Boolean(portal);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return [...CORE_BLOCK_MANIFESTS, ...PREFAB_BLOCK_MANIFESTS].filter((m) => {
      const label = resolveLocalizedValue(m.label, viewerCtx) ?? m.type;
      return label.toLowerCase().includes(q) || m.type.toLowerCase().includes(q);
    });
  }, [query, viewerCtx]);

  const grouped = useMemo(() => {
    const map = new Map<BlockCategory, typeof filtered>();
    for (const m of filtered) {
      const list = map.get(m.category) ?? [];
      list.push(m);
      map.set(m.category, list);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="px-2 py-2">
        <Input
          size="small"
          prefix={<Search className="size-3.5 text-label-secondary" />}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("content_pages:EDITOR_ELEMENTS_SEARCH")}
          allowClear
        />
      </div>

      {bridgeStatus !== "connected" ? (
        <div className="mx-2 mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-caption text-label-secondary">
          {bridgeStatus === "connecting"
            ? t("content_pages:EDITOR_BRIDGE_CONNECTING_NOTICE")
            : t("content_pages:EDITOR_BRIDGE_DISCONNECTED_NOTICE")}
        </div>
      ) : null}

      {/* Block list by category */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {[...grouped.entries()].map(([category, manifests]) => (
          <div key={category} className="mb-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-label-secondary">
              {t(CATEGORY_LABEL_KEYS[category])}
            </div>
            <div className="grid grid-cols-2 gap-1">
              {manifests.map((m) => (
                <BlockInsertTile
                  key={m.type}
                  manifest={m}
                  canInsert={canInsert}
                  label={resolveLocalizedValue(m.label, viewerCtx) ?? m.type}
                  onInsert={() => {
                    if (!portal) return;
                    void (async () => {
                      try {
                        const out = await portal.insertBlock({ type: m.type });
                        setInspectorData(out.inspector);
                        setLayerTree(out.layers);
                        setDirty(true);
                      } catch (err) {
                        notifyErrorText(getErrorMessage(err));
                      }
                    })();
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
