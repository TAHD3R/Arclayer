import { Eye, FolderInput, Settings2, Trash2 } from "lucide-react";
import { memo, type MutableRefObject } from "react";
import { flushSync } from "react-dom";
import type { MouseEvent } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuIconItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@arclayer/ui/context-menu";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { AssetMasonryTile } from "./asset-masonry-card";
import { AssetDraggableProvider } from "./assets-view-dnd";

type AssetsViewAssetRowProps = {
  asset: AssetMasonryItem;
  selected: boolean;
  moving: boolean;
  selectionSizeRef: MutableRefObject<number>;
  onContextMenuCapture: (assetId: string) => void;
  onSelect: (asset: AssetMasonryItem, event: MouseEvent<HTMLDivElement>) => void;
  onToggleSelected: (assetId: string) => void;
  onAspectRatio: (assetId: string, aspectRatio: number) => void;
  onOpen: (asset: AssetMasonryItem) => void;
  onOpenMove: () => void;
  onOpenEditAccess: () => void;
  onOpenBulkDelete: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export const AssetsViewAssetRow = memo(function AssetsViewAssetRow(props: AssetsViewAssetRowProps) {
  const {
    asset,
    moving,
    onOpen,
    onOpenBulkDelete,
    onOpenEditAccess,
    onOpenMove,
    selected,
    selectionSizeRef,
    t,
  } = props;

  return (
    <AssetDraggableProvider assetId={asset.id}>
      {(dnd) => (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              onContextMenuCapture={() => {
                if (selected) return;
                flushSync(() => {
                  props.onContextMenuCapture(asset.id);
                });
              }}
            >
              <AssetMasonryTile
                asset={asset}
                selected={selected}
                moving={moving}
                dragRef={dnd.setNodeRef as unknown as (node: HTMLDivElement | null) => void}
                dragAttributes={dnd.attributes}
                dragListeners={dnd.listeners}
                onSelect={(event) => props.onSelect(asset, event)}
                onToggleSelected={props.onToggleSelected}
                onAspectRatio={props.onAspectRatio}
                onOpen={onOpen}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {selectionSizeRef.current <= 1 ? (
              <ContextMenuIconItem icon={<Eye size={16} />} onSelect={() => onOpen(asset)}>
                {t("assets:ASSET_ACTION_OPEN")}
              </ContextMenuIconItem>
            ) : null}
            <ContextMenuIconItem icon={<FolderInput size={16} />} onSelect={onOpenMove}>
              {t("assets:ASSET_ACTION_MOVE")}
            </ContextMenuIconItem>
            <ContextMenuIconItem icon={<Settings2 size={16} />} onSelect={onOpenEditAccess}>
              {t("assets:ASSET_ACTION_EDIT_ACCESS")}
            </ContextMenuIconItem>
            <ContextMenuSeparator />
            <ContextMenuIconItem
              icon={<Trash2 size={16} />}
              className="text-destructive focus:text-destructive"
              onSelect={onOpenBulkDelete}
            >
              {t("assets:ASSET_ACTION_DELETE_SELECTED")}
            </ContextMenuIconItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </AssetDraggableProvider>
  );
});
