import { memo, type MouseEvent } from "react";

import type { AssetMasonryItem } from "@/types/assets-masonry";

import { AssetsViewAssetRow } from "./assets-view-asset-row";

export type AssetMasonryRenderItem = {
  key: string;
  asset: AssetMasonryItem;
  selected: boolean;
  onOpenAsset: (asset: AssetMasonryItem) => void;
  onSelectAsset: (asset: AssetMasonryItem, event: MouseEvent<HTMLDivElement>) => void;
  onToggleSelected: (assetId: string) => void;
  onAspectRatio: (assetId: string, aspectRatio: number) => void;
};

export const AssetsViewMasonryRenderCell = memo(
  function AssetsViewMasonryRenderCell(props: { data: AssetMasonryRenderItem }) {
    const { data } = props;
    return (
      <AssetsViewAssetRow
        asset={data.asset}
        selected={data.selected}
        onSelect={data.onSelectAsset}
        onToggleSelected={data.onToggleSelected}
        onAspectRatio={data.onAspectRatio}
        onOpen={data.onOpenAsset}
      />
    );
  },
  (prev, next) =>
    prev.data.asset === next.data.asset &&
    prev.data.selected === next.data.selected &&
    prev.data.onOpenAsset === next.data.onOpenAsset &&
    prev.data.onSelectAsset === next.data.onSelectAsset &&
    prev.data.onToggleSelected === next.data.onToggleSelected &&
    prev.data.onAspectRatio === next.data.onAspectRatio,
);
