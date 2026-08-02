import type { AdminAssetFolderOut as AdminAssetFolder } from "@arclayer/openapi";
import type { AssetMasonryItem } from "@/types/assets-masonry";

export type AssetsExplorerPagination = "infinite" | "paged";

export type AssetsExplorerEntry =
  | { kind: "asset"; asset: AssetMasonryItem }
  | { kind: "folder"; folder: AdminAssetFolder }
  | { kind: "folderUp" };
