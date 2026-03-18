import { memo } from "react";
import type { MouseEvent } from "react";

import type { AssetMasonryItem } from "@/types/assets-masonry";
import { AssetMasonryTile } from "./asset-masonry-card";
import type { AssetMoreActionKey, AssetMoreMenuItem } from "./asset-more-actions";
import { AssetDraggableProvider } from "./assets-view-dnd";

type AssetsViewAssetRowProps = {
  asset: AssetMasonryItem;
  selected: boolean;
  moreMenuItems: AssetMoreMenuItem[];
  onSelect: (asset: AssetMasonryItem, event: MouseEvent<HTMLDivElement>) => void;
  onToggleSelected: (assetId: string) => void;
  onAspectRatio: (assetId: string, aspectRatio: number) => void;
  onOpen: (asset: AssetMasonryItem) => void;
  onMoreAction: (key: AssetMoreActionKey, asset: AssetMasonryItem) => void;
  onEdit: (asset: AssetMasonryItem) => void;
  onDelete: (asset: AssetMasonryItem) => void;
};

export const AssetsViewAssetRow = memo(function AssetsViewAssetRow(props: AssetsViewAssetRowProps) {
  const { asset, onOpen, selected } = props;

  return (
    <AssetDraggableProvider assetId={asset.id}>
      {(dragHandle) => (
        <AssetMasonryTile
          asset={asset}
          selected={selected}
          moreMenuItems={props.moreMenuItems}
          onSelect={(event) => props.onSelect(asset, event)}
          onToggleSelected={props.onToggleSelected}
          onAspectRatio={props.onAspectRatio}
          onOpen={onOpen}
          onMoreAction={props.onMoreAction}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
          dragHandle={dragHandle}
        />
      )}
    </AssetDraggableProvider>
  );
});
