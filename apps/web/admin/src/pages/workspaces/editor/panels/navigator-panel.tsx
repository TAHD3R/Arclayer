import { useTranslation } from "react-i18next";

import type { EditorLayerNode } from "@celestial/site-editor-protocol";

import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { getTreeIndentClass } from "@/pages/workspaces/editor/constants/tree-indent";
import { cn } from "@/lib/utils";

function LayerNode({ node, depth }: { node: EditorLayerNode; depth: number }) {
  const { portal } = useEditorBridgeContext();
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);
  const isSelected = selectedBlockId === node.id;

  return (
    <>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-caption",
          getTreeIndentClass(depth),
          isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        )}
        onClick={() => {
          // Optimistic local selection keeps the navigator responsive even if the bridge is reconnecting.
          setSelectedBlockId(node.id);
          void portal?.selectBlock({ blockId: node.id });
        }}
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
          {t("content_pages:EDITOR_V2_EMPTY_LAYERS")}
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
