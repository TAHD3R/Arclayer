import { memo, type MouseEvent } from "react";
import { Skeleton } from "@arclayer/ui/skeleton";

import type { AssetMasonryItem } from "@/types/assets-masonry";

import { AssetsViewAssetRow } from "./assets-view-asset-row";
import type { AssetMoreActionKey, AssetMoreMenuItem } from "./asset-more-actions";

export type AssetMasonryRenderItem =
  | {
      key: string;
      kind: "asset";
      asset: AssetMasonryItem;
      selected: boolean;
      moreMenuItems: AssetMoreMenuItem[];
      onOpenAsset: (asset: AssetMasonryItem) => void;
      onSelectAsset: (asset: AssetMasonryItem, event: MouseEvent<HTMLDivElement>) => void;
      onToggleSelected: (assetId: string) => void;
      onAspectRatio: (assetId: string, aspectRatio: number) => void;
      onMoreAction: (key: AssetMoreActionKey, asset: AssetMasonryItem) => void;
      onEditAsset: (asset: AssetMasonryItem) => void;
      onDeleteAsset: (asset: AssetMasonryItem) => void;
    }
  | {
      key: string;
      kind: "placeholder";
    };

function AssetMasonrySkeletonTile() {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border/50 bg-card shadow-sm">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: 4 / 3 }}>
        <Skeleton className="absolute inset-0 h-full w-full" />
        <div className="absolute left-3 right-3 bottom-3 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    </div>
  );
}

export const AssetsViewMasonryRenderCell = memo(
  function AssetsViewMasonryRenderCell(props: { data: AssetMasonryRenderItem }) {
    const { data } = props;
    if (data.kind === "placeholder") return <AssetMasonrySkeletonTile />;
    return (
      <AssetsViewAssetRow
        asset={data.asset}
        selected={data.selected}
        moreMenuItems={data.moreMenuItems}
        onSelect={data.onSelectAsset}
        onToggleSelected={data.onToggleSelected}
        onAspectRatio={data.onAspectRatio}
        onOpen={data.onOpenAsset}
        onMoreAction={data.onMoreAction}
        onEdit={data.onEditAsset}
        onDelete={data.onDeleteAsset}
      />
    );
  },
  (prev, next) => {
    if (prev.data.kind !== next.data.kind) return false;
    if (prev.data.kind === "placeholder" || next.data.kind === "placeholder") return true;
    return (
      prev.data.asset === next.data.asset &&
      prev.data.selected === next.data.selected &&
      prev.data.moreMenuItems === next.data.moreMenuItems &&
      prev.data.onOpenAsset === next.data.onOpenAsset &&
      prev.data.onSelectAsset === next.data.onSelectAsset &&
      prev.data.onToggleSelected === next.data.onToggleSelected &&
      prev.data.onAspectRatio === next.data.onAspectRatio &&
      prev.data.onMoreAction === next.data.onMoreAction &&
      prev.data.onEditAsset === next.data.onEditAsset &&
      prev.data.onDeleteAsset === next.data.onDeleteAsset
    );
  },
);
