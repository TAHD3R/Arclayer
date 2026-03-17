import { FolderOpen, FolderPlus, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@arclayer/ui/tabs";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import type { AdminAssetFolder } from "@/types/api";

import { AssetsFolderRailOrganizer } from "./assets-folder-rail-organizer";
import { AssetsFolderRailTree } from "./assets-folder-rail-tree";
import {
  buildChildrenByParent,
  buildFolderById,
  buildFolderPath,
} from "./assets-folder-rail-utils";

type AssetsFolderRailProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  folders: AdminAssetFolder[];
  foldersLoading: boolean;
  currentFolderId: string | null;
  focusedFolderId: string | null;
  currentAssetCount: number;
  dropSuccessPulse: { droppableId: string; nonce: number } | null;
  reorderPending: boolean;
  onSelectFolder: (folderId: string | null) => void;
  onFocusFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  onReorderFolders: (folders: AdminAssetFolder[]) => Promise<void>;
};

export function AssetsFolderRail(props: AssetsFolderRailProps) {
  const [tab, setTab] = useState<"browse" | "organize">("browse");
  const folderById = useMemo(() => buildFolderById(props.folders), [props.folders]);
  const childrenByParent = useMemo(() => buildChildrenByParent(props.folders), [props.folders]);
  const currentFolder = props.currentFolderId
    ? (folderById.get(props.currentFolderId) ?? null)
    : null;
  const currentPath = useMemo(
    () => buildFolderPath(props.currentFolderId, folderById),
    [folderById, props.currentFolderId],
  );
  const currentPathText = [
    props.t("assets:ASSET_BREADCRUMB_ROOT"),
    ...currentPath.map((folder) => folder.name),
  ].join(" / ");
  const childFolders = childrenByParent.get(props.currentFolderId) ?? [];

  return (
    <aside className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div className="border-b border-border/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-footnote font-semibold text-foreground">
              <FolderOpen className="size-4 text-label-secondary" />
              <span>{props.t("assets:ASSET_FOLDER_PANEL_TITLE")}</span>
            </div>
            <div className="text-caption leading-5 text-label-secondary">
              {props.t("assets:ASSET_FOLDER_PANEL_SHELL_DESC")}
            </div>
          </div>
          <Button size="sm" onClick={() => props.onCreateFolder(props.currentFolderId)}>
            <FolderPlus data-icon="inline-start" />
            {props.t("assets:ASSET_ACTION_CREATE_FOLDER")}
          </Button>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as typeof tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="px-4 pt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse">
              {props.t("assets:ASSET_FOLDER_PANEL_TAB_BROWSE")}
            </TabsTrigger>
            <TabsTrigger value="organize">
              {props.t("assets:ASSET_FOLDER_PANEL_TAB_ORGANIZE")}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="browse" className="mt-3 min-h-0 flex-1 px-4 pb-4">
          <Frame className="h-full" variant="inverse" spacing="sm" stacked>
            <FramePanel>
              <FrameHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <FrameTitle className="truncate text-footnote font-semibold text-foreground">
                      {currentFolder?.name ?? props.t("assets:ASSET_BREADCRUMB_ROOT")}
                    </FrameTitle>
                    <FrameDescription className="line-clamp-3 text-caption leading-5 text-label-secondary">
                      {currentFolder?.description?.trim() || currentPathText}
                    </FrameDescription>
                  </div>
                  <Badge variant="secondary">
                    {props.t("assets:ASSET_FOLDER_PANEL_CHILDREN", { count: childFolders.length })}
                  </Badge>
                </div>
              </FrameHeader>

              <div className="flex items-start gap-2 rounded-2xl border border-border/60 bg-background/80 px-3 py-2.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-label-secondary" />
                <div className="text-caption leading-5 text-label-secondary">
                  {props.t("assets:ASSET_FOLDER_PANEL_BROWSE_HINT", {
                    count: props.currentAssetCount,
                  })}
                </div>
              </div>
            </FramePanel>

            <FramePanel className="min-h-0 flex-1 overflow-hidden">
              <FrameHeader>
                <FrameTitle className="text-footnote font-semibold text-foreground">
                  {props.t("assets:ASSET_FOLDER_PANEL_TREE_TITLE")}
                </FrameTitle>
                <FrameDescription className="text-caption text-label-secondary">
                  {props.t("assets:ASSET_FOLDER_PANEL_TREE_DESC")}
                </FrameDescription>
              </FrameHeader>
              <AssetsFolderRailTree
                t={props.t}
                folders={props.folders}
                foldersLoading={props.foldersLoading}
                currentFolderId={props.currentFolderId}
                focusedFolderId={props.focusedFolderId}
                rootAssetCount={props.currentFolderId ? 0 : props.currentAssetCount}
                dropSuccessPulse={props.dropSuccessPulse}
                onSelectFolder={props.onSelectFolder}
                onFocusFolder={props.onFocusFolder}
                onCreateFolder={props.onCreateFolder}
                onEditFolder={props.onEditFolder}
                onMoveFolder={props.onMoveFolder}
                onDeleteFolder={props.onDeleteFolder}
              />
            </FramePanel>
          </Frame>
        </TabsContent>

        <TabsContent value="organize" className="mt-3 min-h-0 flex-1 px-4 pb-4">
          <AssetsFolderRailOrganizer
            t={props.t}
            currentFolder={currentFolder}
            currentPathText={currentPathText}
            childFolders={childFolders}
            reorderPending={props.reorderPending}
            onCreateFolder={props.onCreateFolder}
            onEditFolder={props.onEditFolder}
            onMoveFolder={props.onMoveFolder}
            onDeleteFolder={props.onDeleteFolder}
            onSelectFolder={props.onSelectFolder}
            onReorder={props.onReorderFolders}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
