import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Tree } from "antd";

import type { DataNode } from "antd/es/tree";
import type { EditorLayerNode } from "@celestial/site-editor-protocol";

import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { notifyErrorText, getErrorMessage } from "@/lib/notifications";
import { useEditorActions } from "@/pages/workspaces/editor/hooks/use-editor-actions";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type TreeNode = DataNode & { dataRef: EditorLayerNode };

function toTreeData(nodes: EditorLayerNode[]): TreeNode[] {
  return nodes.map((node) => ({
    key: node.id,
    title: node.label || node.type,
    dataRef: node,
    children: node.children?.length ? toTreeData(node.children) : undefined,
  }));
}

function NavigatorNodeTitle(props: { node: TreeNode }) {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();
  const actions = useEditorActions();

  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);

  const isSelected = selectedBlockId === String(props.node.key);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 rounded px-1 py-0.5",
            isSelected ? "bg-accent text-accent-foreground" : null,
          )}
          onClick={() => {
            const id = String(props.node.key);
            setSelectedBlockId(id);
            void portal?.selectBlock({ blockId: id });
          }}
        >
          <span className="min-w-0 flex-1 truncate">{String(props.node.title ?? "")}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={!actions.isEnabled("edit.duplicate")}
          onSelect={() => void actions.run("edit.duplicate")}
        >
          {t("content_pages:EDITOR_MENU_EDIT_DUPLICATE")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!actions.isEnabled("edit.delete")}
          onSelect={() => void actions.run("edit.delete")}
          className="text-destructive focus:text-destructive"
        >
          {t("content_pages:EDITOR_MENU_EDIT_DELETE")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={bridgeStatus !== "connected" || !portal}
          onSelect={() => {
            useEditorStore.getState().setActiveMenuId("blocks");
          }}
        >
          {t("content_pages:EDITOR_MENU_BLOCKS")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function NavigatorPanel() {
  const { t } = useTranslation(["content_pages"]);
  const { portal } = useEditorBridgeContext();

  const layerTree = useEditorStore((s) => s.layerTree);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setSelectedBlockId = useEditorStore((s) => s.setSelectedBlockId);
  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const treeData = useMemo(() => toTreeData(layerTree), [layerTree]);

  if (layerTree.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_EMPTY_LAYERS")}
        </span>
      </div>
    );
  }

  return (
    <div className="p-1">
      <Tree
        blockNode
        showLine={false}
        treeData={treeData}
        selectedKeys={selectedBlockId ? [selectedBlockId] : []}
        draggable={bridgeStatus === "connected" && Boolean(portal)}
        titleRender={(node) => <NavigatorNodeTitle node={node as TreeNode} />}
        onSelect={(keys) => {
          const key = keys?.[0] ? String(keys[0]) : null;
          setSelectedBlockId(key);
          void portal?.selectBlock({ blockId: key });
        }}
        onDrop={(info) => {
          const dragId = String(info.dragNode.key);
          const dropId = String(info.node.key);
          if (!portal || bridgeStatus !== "connected") return;
          if (!dragId || !dropId || dragId === dropId) return;

          const position = info.dropToGap
            ? info.dropPosition < 0
              ? ("before" as const)
              : ("after" as const)
            : ("inside" as const);

          void (async () => {
            try {
              const layers = await portal.moveBlock({
                blockId: dragId,
                targetId: dropId,
                position,
              });
              setLayerTree(layers);
              setDirty(true);
            } catch (err) {
              notifyErrorText(getErrorMessage(err));
            }
          })();
        }}
      />
    </div>
  );
}
