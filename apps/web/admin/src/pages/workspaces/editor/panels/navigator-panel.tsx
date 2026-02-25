import { useTranslation } from "react-i18next";

import type { EditorLayerNode } from "@celestial/site-editor-protocol";

import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

function LayerNode({ node, depth }: { node: EditorLayerNode; depth: number }) {
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);
  const isSelected = selectedBlockId === node.id;

  return (
    <>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-caption ${
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => setSelectedBlockId(node.id)}
      >
        <span className="truncate">{node.label || node.type}</span>
      </button>
      {node.children.map((child) => (
        <LayerNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function NavigatorPanel() {
  const { t } = useTranslation(["content_pages"]);
  const layerTree = useEditorStore((s) => s.layerTree);

  if (layerTree.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_V2_LAYERS_EMPTY", {
            defaultValue: "No layers yet",
          })}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {layerTree.map((node) => (
        <LayerNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}
