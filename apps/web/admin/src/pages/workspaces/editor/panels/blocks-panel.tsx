import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal } from "antd";
import { Plus, Trash2 } from "lucide-react";

import type {
  DesignNodeId,
  DesignNodeV1,
  LocalizedValue,
  PageBlueprint,
  PageBlueprintFragment,
} from "@celestial/site-block-protocol";

import { getWorkspaceSite } from "@/api/workspace-site";
import { createSitePattern, deleteSitePattern, listSitePatterns } from "@/api/site-patterns";
import { notifyErrorText, notifySuccessText, getErrorMessage } from "@/lib/notifications";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuIconItem,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type DesignContainerNodeV1 = Extract<DesignNodeV1, { children: DesignNodeId[] }>;

function isContainerNode(node: DesignNodeV1): node is DesignContainerNodeV1 {
  return node.type === "page_root" || node.type === "frame" || node.type === "group";
}

function extractPageBlueprintFragmentFromDocument(args: {
  document: PageBlueprint;
  rootId: DesignNodeId;
}): PageBlueprintFragment {
  const { document, rootId } = args;
  const root = document.nodesById[rootId];
  if (!root) {
    return { version: 1, rootIds: [], nodesById: {} };
  }

  const reachable = new Set<DesignNodeId>();
  const stack: DesignNodeId[] = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    if (reachable.has(id)) continue;
    const node = document.nodesById[id];
    if (!node) continue;
    reachable.add(id);

    if (isContainerNode(node)) {
      for (const childId of node.children) stack.push(childId);
    }
    if (node.type === "prefab_instance" && node.slotChildren) {
      for (const ids of Object.values(node.slotChildren)) {
        for (const childId of ids) stack.push(childId);
      }
    }
  }

  const nodesById: Record<DesignNodeId, DesignNodeV1> = {};
  for (const id of reachable) {
    const node = document.nodesById[id];
    if (!node) continue;
    nodesById[id] = node;
  }

  return { version: 1, rootIds: [rootId], nodesById };
}

function resolveLocalizedLabel(label: Record<string, string> | undefined, locale: string): string {
  if (!label) return "";
  return label[locale] || label["en-US"] || label["zh-CN"] || Object.values(label)[0] || "";
}

function buildDefaultPatternCode(): string {
  return `block-${Date.now().toString(36)}`;
}

function buildPatternLabel(value: string): LocalizedValue<string> {
  const v = (value || "").trim();
  return v ? { "zh-CN": v, "en-US": v } : {};
}

export function BlocksPanel() {
  const { t, i18n } = useTranslation(["content_pages"]);
  const queryClient = useQueryClient();
  const { workspaceId } = useEditorConfig();
  const { portal } = useEditorBridgeContext();

  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState(buildDefaultPatternCode());
  const [label, setLabel] = useState("");

  const siteQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site"],
    queryFn: () => getWorkspaceSite(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const siteId = siteQuery.data?.siteId ?? "";

  const patternsQuery = useQuery({
    queryKey: ["site", siteId, "patterns"],
    queryFn: () => listSitePatterns(siteId, { page: 1, size: 100 }),
    enabled: Boolean(siteId),
    staleTime: 15 * 1000,
    meta: { silent: true },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!portal || bridgeStatus !== "connected") {
        throw new Error("BRIDGE_NOT_READY");
      }
      if (!selectedBlockId) {
        throw new Error("NO_SELECTION");
      }
      if (!siteId) {
        throw new Error("SITE_NOT_READY");
      }

      const doc = await portal.getDocument();
      const fragment = extractPageBlueprintFragmentFromDocument({
        document: doc,
        rootId: selectedBlockId,
      });
      if (!fragment.rootIds.length) {
        throw new Error("BLOCK_NOT_FOUND");
      }

      const payload = {
        code: (code || "").trim(),
        label: buildPatternLabel(label || code) as Record<string, string>,
        category: "custom",
        pageBlueprintFragment: fragment,
      };

      return createSitePattern(siteId, payload);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_pages:EDITOR_BLOCKS_CREATED"));
      setCreateOpen(false);
      setCode(buildDefaultPatternCode());
      setLabel("");
      await queryClient.invalidateQueries({ queryKey: ["site", siteId, "patterns"] });
    },
    onError: (err) => notifyErrorText(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (patternId: string) => {
      if (!siteId) throw new Error("SITE_NOT_READY");
      await deleteSitePattern(siteId, patternId);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_pages:EDITOR_BLOCKS_DELETED"));
      await queryClient.invalidateQueries({ queryKey: ["site", siteId, "patterns"] });
    },
    onError: (err) => notifyErrorText(getErrorMessage(err)),
  });

  const patterns = patternsQuery.data?.items ?? [];

  const filtered = useMemo(() => {
    const q = (search || "").trim().toLowerCase();
    if (!q) return patterns;
    return patterns.filter((p) => {
      const labelText = resolveLocalizedLabel(p.label, i18n.language);
      return (
        p.code.toLowerCase().includes(q) ||
        labelText.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    });
  }, [i18n.language, patterns, search]);

  const canCreate = Boolean(siteId && portal && bridgeStatus === "connected" && selectedBlockId);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-2 py-2">
        <Input
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("content_pages:EDITOR_BLOCKS_SEARCH_PLACEHOLDER")}
          allowClear
        />
        <Button
          size="small"
          type="primary"
          icon={<Plus className="size-4" />}
          disabled={!canCreate}
          loading={createMutation.isPending}
          onClick={() => {
            setCode(buildDefaultPatternCode());
            setLabel("");
            setCreateOpen(true);
          }}
        >
          {t("content_pages:EDITOR_BLOCKS_CREATE")}
        </Button>
      </div>

      {bridgeStatus !== "connected" ? (
        <div className="mx-2 mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-caption text-label-secondary">
          {bridgeStatus === "connecting"
            ? t("content_pages:EDITOR_BRIDGE_CONNECTING_NOTICE")
            : t("content_pages:EDITOR_BRIDGE_DISCONNECTED_NOTICE")}
        </div>
      ) : null}

      <div
        className={cn(
          "flex-1 overflow-auto p-2",
          bridgeStatus !== "connected" ? "opacity-60" : null,
        )}
      >
        {patternsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-caption text-label-secondary">
            {t("content_pages:EDITOR_BLOCKS_EMPTY")}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((p) => {
              const title = resolveLocalizedLabel(p.label, i18n.language) || p.code;
              return (
                <ContextMenu key={p.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md border border-border/60 bg-card px-3 py-2 text-left",
                        "hover:bg-muted",
                      )}
                      onClick={() => {
                        if (!portal || bridgeStatus !== "connected") return;
                        const fragment = p.pageBlueprintFragment;
                        if (!fragment?.rootIds?.length) return;
                        void (async () => {
                          try {
                            const out = await portal.insertBlockTree({
                              rootIds: fragment.rootIds,
                              nodesById: fragment.nodesById,
                              targetBlockId: selectedBlockId,
                              position: selectedBlockId ? "inside" : undefined,
                            });
                            setInspectorData(out.inspector);
                            setLayerTree(out.layers);
                            setDirty(true);
                          } catch (err) {
                            notifyErrorText(getErrorMessage(err));
                          }
                        })();
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-footnote font-medium">{title}</div>
                          <div className="truncate text-caption text-label-secondary">{p.code}</div>
                        </div>
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem
                      onSelect={() => {
                        if (!portal || bridgeStatus !== "connected") return;
                        const fragment = p.pageBlueprintFragment;
                        if (!fragment?.rootIds?.length) return;
                        void (async () => {
                          try {
                            const out = await portal.insertBlockTree({
                              rootIds: fragment.rootIds,
                              nodesById: fragment.nodesById,
                              targetBlockId: selectedBlockId,
                              position: selectedBlockId ? "inside" : undefined,
                            });
                            setInspectorData(out.inspector);
                            setLayerTree(out.layers);
                            setDirty(true);
                          } catch (err) {
                            notifyErrorText(getErrorMessage(err));
                          }
                        })();
                      }}
                    >
                      {t("content_pages:EDITOR_BLOCKS_ACTION_INSERT")}
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuIconItem
                      icon={<Trash2 className="size-4" />}
                      onSelect={() => {
                        void deleteMutation.mutateAsync(p.id);
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      {t("content_pages:EDITOR_BLOCKS_ACTION_DELETE")}
                    </ContextMenuIconItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        title={t("content_pages:EDITOR_BLOCKS_CREATE_MODAL_TITLE")}
        open={createOpen}
        okText={t("content_pages:EDITOR_BLOCKS_CREATE_MODAL_OK")}
        cancelText={t("content_pages:EDITOR_BLOCKS_CREATE_MODAL_CANCEL")}
        confirmLoading={createMutation.isPending}
        onOk={() => void createMutation.mutateAsync()}
        onCancel={() => setCreateOpen(false)}
      >
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-label-secondary">
              {t("content_pages:EDITOR_BLOCKS_FIELD_CODE")}
            </span>
            <Input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption text-label-secondary">
              {t("content_pages:EDITOR_BLOCKS_FIELD_LABEL")}
            </span>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
      </Modal>
    </div>
  );
}
