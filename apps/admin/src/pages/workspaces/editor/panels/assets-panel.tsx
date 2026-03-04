import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Input, Button } from "antd";
import { useDraggable } from "@dnd-kit/core";
import { Search } from "lucide-react";

import type { AssetMasonryItem } from "@/types/assets-masonry";
import {
  AssetsExplorerFolderTile,
  AssetsExplorerFolderUpTile,
} from "@/pages/workspaces/assets/components/explorer/assets-explorer-folder-tiles";
import { useAssetsExplorerController } from "@/pages/workspaces/assets/components/explorer/use-assets-explorer-controller";
import type { AdminAssetFolder } from "@/types/api";
import { resolveAssetRefToPublicUrlPath } from "@/lib/assets/asset-urls";
import { cn } from "@celestial/lib/utils";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useEditorBridgeContext } from "@/pages/workspaces/editor/contexts/editor-bridge-context";
import { useEditorSelectionPatch } from "@/pages/workspaces/editor/hooks/use-editor-selection-patch";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";
import { notifyErrorText, getErrorMessage } from "@/lib/notifications";
import type { DesignLayoutV1, DesignNodeV1 } from "@celestial/block-protocol";

function defaultRectLayout(x: number, y: number, width: number, height: number): DesignLayoutV1 {
  return {
    self: {
      rect: { x, y, width, height },
      constraints: { horizontal: "left", vertical: "top" },
      alignX: "start",
      alignY: "start",
    },
    children: { mode: "absolute" },
  };
}

function AssetTile(props: { asset: AssetMasonryItem; disabled: boolean; onClick: () => void }) {
  const { asset, disabled } = props;
  const dnd = useDraggable({
    id: `asset:${asset.id}`,
    data: { editorItem: { kind: "asset", assetId: asset.id, assetName: asset.name } },
    disabled,
  });

  const previewSrc =
    asset.previewUrl || asset.publicUrl || resolveAssetRefToPublicUrlPath(asset.id) || "";

  return (
    <button
      ref={dnd.setNodeRef}
      type="button"
      className={cn(
        "group flex w-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card",
        "transition-shadow hover:shadow-sm",
        disabled ? "cursor-not-allowed opacity-60" : null,
      )}
      disabled={disabled}
      onClick={props.onClick}
      {...dnd.listeners}
      {...dnd.attributes}
    >
      <div className="relative w-full bg-muted/10" style={{ aspectRatio: 4 / 3 }}>
        {previewSrc ? (
          <img
            src={previewSrc}
            alt={asset.name}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-caption text-label-secondary">
            {asset.mimeType || "asset"}
          </div>
        )}
      </div>
      <div className="min-w-0 px-2 py-1.5 text-left">
        <div className="truncate text-caption font-medium">{asset.name}</div>
      </div>
    </button>
  );
}

export function AssetsPanel() {
  const { t } = useTranslation(["content_pages", "assets", "common"]);
  const { workspaceId } = useEditorConfig();
  const { portal } = useEditorBridgeContext();

  const bridgeStatus = useEditorStore((s) => s.bridgeStatus);
  const inspectorData = useEditorStore((s) => s.inspectorData);
  const selectedBlockId = useEditorStore((s) => s.selectedBlockId);
  const setInspectorData = useEditorStore((s) => s.setInspectorData);
  const setLayerTree = useEditorStore((s) => s.setLayerTree);
  const setDirty = useEditorStore((s) => s.setDirty);

  const patchSelection = useEditorSelectionPatch();

  const explorer = useAssetsExplorerController({
    workspaceId,
    pagination: "infinite",
    purpose: "library",
    defaultVisibility: "public",
    defaultOrdering: "-created_at",
  });

  const folderLabel = useMemo(() => t("assets:ASSET_FOLDER"), [t]);
  const isInteractive = bridgeStatus === "connected" && Boolean(portal);
  const canReplaceImage =
    isInteractive && inspectorData.blockType === "image" && Boolean(selectedBlockId);

  const loadMoreEnabled = Boolean(
    explorer.infiniteAssetsQuery.hasNextPage && !explorer.infiniteAssetsQuery.isFetchingNextPage,
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search */}
      <div className="px-2 py-2">
        <Input
          size="small"
          prefix={<Search className="size-3.5 text-label-secondary" />}
          variant="filled"
          value={explorer.searchInput}
          onChange={(e) => explorer.setSearchInput(e.target.value)}
          placeholder={t("assets:ASSET_SEARCH_PLACEHOLDER")}
          allowClear
        />
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-2 pb-2 text-caption text-label-secondary">
        <Button
          type="text"
          size="small"
          onClick={() => {
            explorer.setCurrentFolderId(null);
            explorer.setFocusedFolderId(null);
          }}
          autoInsertSpace={false}
        >
          {t("assets:ASSET_BREADCRUMB_ROOT")}
        </Button>
        {explorer.folderPath.map((folder) => (
          <div key={String(folder.id)} className="flex items-center gap-1">
            <span className="opacity-50">/</span>
            <Button
              type="text"
              size="small"
              onClick={() => {
                explorer.setCurrentFolderId(String(folder.id));
                explorer.setFocusedFolderId(null);
              }}
              autoInsertSpace={false}
            >
              {folder.name}
            </Button>
          </div>
        ))}
      </div>

      {bridgeStatus !== "connected" ? (
        <div className="mx-2 mb-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-caption text-label-secondary">
          {bridgeStatus === "connecting"
            ? t("content_pages:EDITOR_BRIDGE_CONNECTING_NOTICE")
            : t("content_pages:EDITOR_BRIDGE_DISCONNECTED_NOTICE")}
        </div>
      ) : null}

      {/* Folders + Assets */}
      <div className={cn("flex-1 overflow-auto px-2 pb-2", !isInteractive ? "opacity-60" : null)}>
        {/* Folder grid */}
        {explorer.folderEntries.length > 0 ? (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {explorer.folderEntries.map((entry) => {
              if (entry.kind === "folderUp") {
                return (
                  <AssetsExplorerFolderUpTile
                    key="folder:__up__"
                    label={t("assets:ASSET_FOLDER_UP")}
                    onClick={() => {
                      const folders = (explorer.foldersQuery.data?.items ??
                        []) as AdminAssetFolder[];
                      const current = folders.find(
                        (f) => String(f.id) === String(explorer.currentFolderId),
                      );
                      explorer.setCurrentFolderId(
                        current?.parentId ? String(current.parentId) : null,
                      );
                    }}
                    onDoubleClick={() => {
                      const folders = (explorer.foldersQuery.data?.items ??
                        []) as AdminAssetFolder[];
                      const current = folders.find(
                        (f) => String(f.id) === String(explorer.currentFolderId),
                      );
                      explorer.setCurrentFolderId(
                        current?.parentId ? String(current.parentId) : null,
                      );
                    }}
                  />
                );
              }
              if (entry.kind === "folder") {
                return (
                  <AssetsExplorerFolderTile
                    key={`folder:${entry.folder.id}`}
                    folder={entry.folder}
                    folderLabel={folderLabel}
                    focused={explorer.focusedFolderId === String(entry.folder.id)}
                    onClick={() => explorer.setFocusedFolderId(String(entry.folder.id))}
                    onDoubleClick={() => {
                      explorer.setCurrentFolderId(String(entry.folder.id));
                      explorer.setFocusedFolderId(null);
                    }}
                  />
                );
              }
              return null;
            })}
          </div>
        ) : null}

        {/* Asset grid */}
        {explorer.items.length === 0 && explorer.assetsQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : explorer.items.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-caption text-label-secondary">
            {t("content_pages:EDITOR_EMPTY_ASSETS")}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {explorer.items.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                disabled={!isInteractive}
                onClick={() => {
                  if (!portal || bridgeStatus !== "connected") return;
                  const src = resolveAssetRefToPublicUrlPath(asset.id) ?? "";

                  if (canReplaceImage) {
                    void patchSelection("component", { src }, { commit: "immediate" });
                    return;
                  }

                  void (async () => {
                    try {
                      const rootId = "pattern_image";
                      const nodesById: Record<string, DesignNodeV1> = {
                        [rootId]: {
                          id: rootId,
                          type: "image",
                          name: asset.name ? `Image(${asset.name})` : "Image",
                          src,
                          alt: { "zh-CN": asset.name ?? "", "en-US": asset.name ?? "" },
                          objectFit: "cover",
                          layout: defaultRectLayout(0, 0, 360, 240),
                          style: {},
                        },
                      };
                      const out = await portal.insertBlockTree({
                        rootIds: [rootId],
                        nodesById,
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
              />
            ))}
          </div>
        )}

        {explorer.infiniteAssetsQuery.hasNextPage ? (
          <div className="mt-3 flex justify-center">
            <Button
              size="small"
              disabled={!loadMoreEnabled}
              loading={explorer.infiniteAssetsQuery.isFetchingNextPage}
              onClick={() => void explorer.infiniteAssetsQuery.fetchNextPage()}
              autoInsertSpace={false}
            >
              {t("common:LOAD_MORE")}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
