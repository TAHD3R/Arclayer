import { memo } from "react";
import type { MouseEvent } from "react";

import type { AssetMasonryItem } from "@/types/assets-masonry";
import { AssetMasonryTile } from "./asset-masonry-card";
import { AssetDraggableProvider } from "./assets-view-dnd";

type AssetsViewAssetRowProps = {
  asset: AssetMasonryItem;
  selected: boolean;
  onSelect: (asset: AssetMasonryItem, event: MouseEvent<HTMLDivElement>) => void;
  onToggleSelected: (assetId: string) => void;
  onAspectRatio: (assetId: string, aspectRatio: number) => void;
  onOpen: (asset: AssetMasonryItem) => void;
};

export const AssetsViewAssetRow = memo(function AssetsViewAssetRow(props: AssetsViewAssetRowProps) {
  const { asset, onOpen, selected } = props;

  return (
    <AssetDraggableProvider assetId={asset.id}>
      {(dragHandle) => (
        <AssetMasonryTile
          asset={asset}
          selected={selected}
          onSelect={(event) => props.onSelect(asset, event)}
          onToggleSelected={props.onToggleSelected}
          onAspectRatio={props.onAspectRatio}
          onOpen={onOpen}
          dragHandle={dragHandle}
        />
      )}
    </AssetDraggableProvider>
  );
});
