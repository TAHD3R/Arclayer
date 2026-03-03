import type { DesignBindingExprV1, PageBlueprint } from "@celestial/block-protocol";
import { Button, Space, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { PrefabRegistryV1 } from "@celestial/renderer";

export type LayersSelection =
  | { kind: "doc"; nodeId: string }
  | { kind: "prefabTpl"; instanceId: string; templateNodeId: string }
  | null;

function isBindingExpr(value: unknown): value is DesignBindingExprV1 {
  return Boolean(value && typeof value === "object" && (value as any).kind === "binding");
}

function buildTreeData(doc: PageBlueprint, prefabRegistry: PrefabRegistryV1): DataNode[] {
  const root = doc.nodesById[doc.rootId];
  if (!root || root.type !== "page_root") return [];

  const keyOfDoc = (id: string) => `doc:${id}`;
  const keyOfTpl = (instanceId: string, templateNodeId: string) =>
    `tpl:${instanceId}:${templateNodeId}`;

  const labelForNode = (id: string): string => {
    const node = doc.nodesById[id];
    if (!node) return id;
    const name = (node as any).name ? String((node as any).name) : "";
    if (name.trim()) return `${name.trim()} (${node.type})`;
    if (node.type === "prefab_instance") {
      const prefabId = String((node as any).prefabId || "");
      return prefabId ? `Prefab: ${prefabId}` : `Prefab (${id})`;
    }
    return `${node.type} (${id})`;
  };

  const listEditableTemplateNodes = (
    instanceId: string,
  ): Array<{ templateNodeId: string; label: string }> => {
    const inst = doc.nodesById[instanceId];
    if (!inst || inst.type !== "prefab_instance") return [];
    const def = prefabRegistry.get(inst.prefabId);
    if (!def) return [];

    const out: Array<{ templateNodeId: string; label: string }> = [];
    for (const [tplId, node] of Object.entries(def.template.nodesById)) {
      if (!node || tplId === def.template.rootId || node.type === "page_root") continue;
      if (node.type === "text") {
        if (isBindingExpr((node as any).text) && (node as any).text.source === "prefabProps") {
          out.push({ templateNodeId: tplId, label: `${(node as any).name || tplId} (text)` });
        }
        continue;
      }
      if (node.type === "image") {
        if (isBindingExpr((node as any).src) && (node as any).src.source === "prefabProps") {
          out.push({ templateNodeId: tplId, label: `${(node as any).name || tplId} (image)` });
        }
        continue;
      }
      if (node.type === "embed") {
        if (isBindingExpr((node as any).url) && (node as any).url.source === "prefabProps") {
          out.push({ templateNodeId: tplId, label: `${(node as any).name || tplId} (embed)` });
        }
      }
    }
    return out;
  };

  const buildChildren = (ids: string[]): DataNode[] => {
    const out: DataNode[] = [];
    for (const id of ids) {
      const node = doc.nodesById[id];
      if (!node) continue;

      const childrenIds =
        node.type === "page_root"
          ? node.children
          : node.type === "group" || node.type === "frame"
            ? node.children
            : [];

      const slotChildren =
        node.type === "prefab_instance" && node.slotChildren
          ? Object.entries(node.slotChildren).flatMap(([slotKey, slotIds]) => {
              const slotNodes = buildChildren(slotIds ?? []);
              if (!slotNodes.length) return [];
              return [
                {
                  key: `slot:${id}:${slotKey}`,
                  title: `slot:${slotKey}`,
                  selectable: false,
                  children: slotNodes,
                } satisfies DataNode,
              ];
            })
          : [];

      const tplChildren =
        node.type === "prefab_instance"
          ? (() => {
              const tpl = listEditableTemplateNodes(node.id);
              if (!tpl.length) return [];
              return [
                {
                  key: `structure:${node.id}`,
                  title: "structure",
                  selectable: false,
                  children: tpl.map(
                    (it) =>
                      ({
                        key: keyOfTpl(node.id, it.templateNodeId),
                        title: it.label,
                        isLeaf: true,
                      }) satisfies DataNode,
                  ),
                } satisfies DataNode,
              ];
            })()
          : [];

      out.push({
        key: keyOfDoc(id),
        title: labelForNode(id),
        children: [...buildChildren(childrenIds), ...slotChildren, ...tplChildren],
      });
    }
    return out;
  };

  return [
    {
      key: keyOfDoc(root.id),
      title: labelForNode(root.id),
      selectable: true,
      children: buildChildren(root.children ?? []),
    },
  ];
}

export function LayersPanel(props: {
  doc: PageBlueprint;
  prefabRegistry: PrefabRegistryV1;
  selection: LayersSelection;
  onSelectSelection: (next: LayersSelection) => void;
  onRequestDelete?: () => void;
}) {
  const { t } = useTranslation(["editor"]);

  const treeData = useMemo(
    () => buildTreeData(props.doc, props.prefabRegistry),
    [props.doc, props.prefabRegistry],
  );

  const selectedKeys = useMemo(() => {
    if (!props.selection) return [];
    if (props.selection.kind === "doc") return [`doc:${props.selection.nodeId}`];
    return [`tpl:${props.selection.instanceId}:${props.selection.templateNodeId}`];
  }, [props.selection]);

  return (
    <Space direction="vertical" size={12} className="w-full">
      <div className="flex items-center justify-between gap-2">
        <Typography.Title level={5} style={{ margin: 0 }}>
          {t("editor:EDITOR_LEFT_MENU_LAYERS")}
        </Typography.Title>
        {props.onRequestDelete ? (
          <Button danger size="small" onClick={props.onRequestDelete}>
            {t("editor:EDITOR_DELETE")}
          </Button>
        ) : null}
      </div>

      <Tree
        showLine
        blockNode
        selectedKeys={selectedKeys}
        treeData={treeData}
        onSelect={(keys) => {
          const key = keys[0] ? String(keys[0]) : "";
          if (!key || key.startsWith("slot:") || key.startsWith("structure:")) {
            props.onSelectSelection(null);
            return;
          }
          if (key.startsWith("doc:")) {
            const id = key.slice("doc:".length);
            props.onSelectSelection(id ? { kind: "doc", nodeId: id } : null);
            return;
          }
          if (key.startsWith("tpl:")) {
            const rest = key.slice("tpl:".length);
            const [instanceId, templateNodeId] = rest.split(":");
            if (!instanceId || !templateNodeId) {
              props.onSelectSelection(null);
              return;
            }
            props.onSelectSelection({ kind: "prefabTpl", instanceId, templateNodeId });
          }
        }}
      />
    </Space>
  );
}
