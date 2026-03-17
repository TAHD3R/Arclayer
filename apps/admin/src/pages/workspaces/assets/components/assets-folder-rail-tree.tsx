import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Spinner } from "@arclayer/ui/spinner";

import type { AdminAssetFolder } from "@/types/api";

import { buildChildrenByParent, buildFolderById } from "./assets-folder-rail-utils";
import { FolderTreeNode, FolderTreeRootRow } from "./assets-folder-rail-tree-row";

type AssetsFolderRailTreeProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  folders: AdminAssetFolder[];
  foldersLoading: boolean;
  currentFolderId: string | null;
  focusedFolderId: string | null;
  rootAssetCount: number;
  dropSuccessPulse: { droppableId: string; nonce: number } | null;
  onSelectFolder: (folderId: string | null) => void;
  onFocusFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
};

function getExpandedAncestors(
  currentFolderId: string | null,
  folderById: ReadonlyMap<string, AdminAssetFolder>,
): Set<string> {
  const expanded = new Set<string>();
  let cursor = currentFolderId ? folderById.get(currentFolderId) : undefined;
  for (let guard = 0; guard < 24 && cursor; guard += 1) {
    expanded.add(String(cursor.id));
    const parentId = cursor.parentId ? String(cursor.parentId) : null;
    cursor = parentId ? folderById.get(parentId) : undefined;
  }
  return expanded;
}

export function AssetsFolderRailTree(props: AssetsFolderRailTreeProps) {
  const childrenByParent = useMemo(() => buildChildrenByParent(props.folders), [props.folders]);
  const folderById = useMemo(() => buildFolderById(props.folders), [props.folders]);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setExpandedFolderIds((prev) => {
      const next = new Set(prev);
      for (const folderId of getExpandedAncestors(props.currentFolderId, folderById)) {
        next.add(folderId);
      }
      return next;
    });
  }, [folderById, props.currentFolderId]);

  const renderTree = (parentId: string | null, depth = 0): ReactNode => {
    const folders = childrenByParent.get(parentId) ?? [];
    return folders.map((folder) => (
      <FolderTreeNode
        key={String(folder.id)}
        t={props.t}
        folder={folder}
        currentFolderId={props.currentFolderId}
        focusedFolderId={props.focusedFolderId}
        depth={depth}
        childrenByParent={childrenByParent}
        expandedFolderIds={expandedFolderIds}
        dropSuccessPulse={props.dropSuccessPulse}
        onToggleExpanded={(folderId) => {
          setExpandedFolderIds((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
          });
        }}
        onSelectFolder={props.onSelectFolder}
        onFocusFolder={props.onFocusFolder}
        onCreateFolder={(parentIdValue) => props.onCreateFolder(parentIdValue)}
        onEditFolder={props.onEditFolder}
        onMoveFolder={props.onMoveFolder}
        onDeleteFolder={props.onDeleteFolder}
      />
    ));
  };

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="space-y-2 px-1 pb-1">
        <FolderTreeRootRow
          t={props.t}
          currentFolderId={props.currentFolderId}
          rootAssetCount={props.rootAssetCount}
          dropSuccessPulse={props.dropSuccessPulse}
          onSelectFolder={() => props.onSelectFolder(null)}
          onCreateFolder={() => props.onCreateFolder(null)}
        />

        {props.foldersLoading ? (
          <div className="flex items-center justify-center py-8 text-label-secondary">
            <Spinner className="size-4" />
          </div>
        ) : props.folders.length > 0 ? (
          <div className="space-y-1">{renderTree(null)}</div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-5">
            <div className="text-footnote font-medium text-foreground">
              {props.t("assets:ASSET_FOLDER_PANEL_EMPTY")}
            </div>
            <div className="mt-1 text-caption leading-5 text-label-secondary">
              {props.t("assets:ASSET_FOLDER_PANEL_EMPTY_DESC")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
