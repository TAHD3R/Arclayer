import type { AdminAssetFolder } from "@/api/assets";
import type { AssetMasonryItem } from "@/components/common/assets/asset-masonry-card";

export type AssetsExplorerPagination = "infinite" | "paged";

export type AssetsExplorerEntry =
  | { kind: "asset"; asset: AssetMasonryItem }
  | { kind: "folder"; folder: AdminAssetFolder }
  | { kind: "folderUp" };
