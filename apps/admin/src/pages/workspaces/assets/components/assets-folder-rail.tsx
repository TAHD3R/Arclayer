import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import type { ResolvedRecentAsset } from "@/lib/assets/assets-recent";
import type { AdminAssetFolder } from "@/types/api";
import type { AssetMasonryItem } from "@/types/assets-masonry";

import { AssetsFolderRailFolderSection } from "./assets-folder-rail-folder-section";
import { AssetsFolderRailRecentSection } from "./assets-folder-rail-recent-section";

type AssetsFolderRailProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  scope: AssetScopeRef | null;
  folders: AdminAssetFolder[];
  foldersLoading: boolean;
  foldersError: boolean;
  currentFolderId: string | null;
  activeAssetId?: string | null;
  recentAssets: ResolvedRecentAsset[];
  onRetryFolders: () => void;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  dropSuccessPulse?: {
    droppableId: string;
    nonce: number;
  } | null;
  tooltipDisabled?: boolean;
  isDraggingAssets?: boolean;
  onOpenAsset: (asset: AssetMasonryItem) => void;
  onRemoveRecentAsset: (key: string) => void;
  onClearRecentAssets: () => void;
};

export function AssetsFolderRail(props: AssetsFolderRailProps) {
  return (
    <aside className="w-full min-w-0">
      <div className="pl-8 pb-8">
        <AssetsFolderRailFolderSection
          t={props.t}
          folders={props.folders}
          foldersLoading={props.foldersLoading}
          foldersError={props.foldersError}
          currentFolderId={props.currentFolderId}
          onRetryFolders={props.onRetryFolders}
          onSelectFolder={props.onSelectFolder}
          onCreateFolder={props.onCreateFolder}
          onEditFolder={props.onEditFolder}
          onMoveFolder={props.onMoveFolder}
          onDeleteFolder={props.onDeleteFolder}
          dropSuccessPulse={props.dropSuccessPulse}
          tooltipDisabled={props.tooltipDisabled}
          isDraggingAssets={props.isDraggingAssets}
        />
        <AssetsFolderRailRecentSection
          t={props.t}
          scope={props.scope}
          foldersLoading={props.foldersLoading}
          activeAssetId={props.activeAssetId}
          recentAssets={props.recentAssets}
          onOpenAsset={props.onOpenAsset}
          onRemoveRecentAsset={props.onRemoveRecentAsset}
          onClearRecentAssets={props.onClearRecentAssets}
        />
      </div>
    </aside>
  );
}
