import type { AdminAssetFolder } from "@/types/api";
import type { AssetMasonryItem } from "@/components/assets/asset-masonry-card";

export type AssetsExplorerPagination = "infinite" | "paged";

export type AssetsExplorerEntry =
  | { kind: "asset"; asset: AssetMasonryItem }
  | { kind: "folder"; folder: AdminAssetFolder }
  | { kind: "folderUp" };
