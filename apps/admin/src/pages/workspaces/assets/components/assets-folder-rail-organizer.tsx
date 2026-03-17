import {
  FolderInput,
  FolderOpen,
  FolderPlus,
  GripVertical,
  PencilLine,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@arclayer/ui/item";
import { Sortable, SortableItem, SortableItemHandle } from "@/components/reui/sortable";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame";
import type { AdminAssetFolder } from "@/types/api";

interface AssetsFolderRailOrganizerProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  currentFolder: AdminAssetFolder | null;
  currentPathText: string;
  childFolders: AdminAssetFolder[];
  reorderPending: boolean;
  onCreateFolder: (parentId: string | null) => void;
  onEditFolder: (folder: AdminAssetFolder) => void;
  onMoveFolder: (folder: AdminAssetFolder) => void;
  onDeleteFolder: (folder: AdminAssetFolder) => void;
  onSelectFolder: (folderId: string | null) => void;
  onReorder: (folders: AdminAssetFolder[]) => Promise<void>;
}

function FolderOrganizerHeader(props: {
  t: AssetsFolderRailOrganizerProps["t"];
  currentFolder: AdminAssetFolder | null;
  currentPathText: string;
  childCount: number;
  onCreateFolder: () => void;
  onEditFolder: () => void;
  onMoveFolder: () => void;
  onDeleteFolder: () => void;
}) {
  const subtitle = props.currentFolder
    ? props.currentFolder.description?.trim() || props.currentPathText
    : props.t("assets:ASSET_FOLDER_PANEL_ORGANIZE_ROOT_DESC");

  return (
    <FramePanel>
      <FrameHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <FrameTitle className="truncate text-footnote font-semibold text-foreground">
              {props.currentFolder?.name ?? props.t("assets:ASSET_BREADCRUMB_ROOT")}
            </FrameTitle>
            <FrameDescription className="line-clamp-3 text-caption leading-5 text-label-secondary">
              {subtitle}
            </FrameDescription>
          </div>
          <Badge variant="secondary">
            {props.t("assets:ASSET_FOLDER_PANEL_CHILDREN", { count: props.childCount })}
          </Badge>
        </div>
      </FrameHeader>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={props.onCreateFolder}>
          <FolderPlus data-icon="inline-start" />
          {props.t("assets:ASSET_ACTION_CREATE_FOLDER")}
        </Button>
        {props.currentFolder ? (
          <>
            <Button variant="outline" size="sm" onClick={props.onEditFolder}>
              <PencilLine data-icon="inline-start" />
              {props.t("assets:ASSET_ACTION_EDIT_FOLDER")}
            </Button>
            <Button variant="outline" size="sm" onClick={props.onMoveFolder}>
              <FolderInput data-icon="inline-start" />
              {props.t("assets:ASSET_ACTION_MOVE_FOLDER")}
            </Button>
            <Button variant="destructive" size="sm" onClick={props.onDeleteFolder}>
              <Trash2 data-icon="inline-start" />
              {props.t("assets:ASSET_ACTION_DELETE_FOLDER")}
            </Button>
          </>
        ) : null}
      </div>
    </FramePanel>
  );
}

function FolderOrganizerEmpty(props: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <FramePanel className="grid min-h-48 place-items-center">
      <div className="max-w-xs text-center">
        <div className="text-footnote font-semibold text-foreground">{props.title}</div>
        <div className="mt-2 text-caption leading-5 text-label-secondary">{props.description}</div>
        <Button className="mt-4" size="sm" onClick={props.onAction}>
          <FolderPlus data-icon="inline-start" />
          {props.actionLabel}
        </Button>
      </div>
    </FramePanel>
  );
}

function SortableFolderItem(props: {
  folder: AdminAssetFolder;
  disabled: boolean;
  t: AssetsFolderRailOrganizerProps["t"];
  onSelect: () => void;
}) {
  const summary =
    props.folder.description?.trim() || props.t("assets:ASSET_FOLDER_PANEL_REORDER_HINT");

  return (
    <SortableItem value={String(props.folder.id)} disabled={props.disabled}>
      <Item
        size="sm"
        variant="outline"
        asChild
        className="w-full rounded-xl bg-background transition-colors hover:bg-accent/35"
      >
        <button type="button" onClick={props.onSelect}>
          <ItemMedia variant="icon" className="size-8 rounded-lg border-border/60 bg-muted/60">
            <FolderOpen className="size-4 text-label-secondary" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="min-w-0 flex-1 truncate">{props.folder.name}</ItemTitle>
            <ItemDescription className="truncate">{summary}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <SortableItemHandle className="rounded-md p-1 text-label-secondary hover:bg-muted/70 hover:text-foreground">
              <GripVertical className="size-4" />
            </SortableItemHandle>
          </ItemActions>
        </button>
      </Item>
    </SortableItem>
  );
}

export function AssetsFolderRailOrganizer(props: AssetsFolderRailOrganizerProps) {
  const [orderedFolders, setOrderedFolders] = useState(props.childFolders);

  useEffect(() => {
    setOrderedFolders(props.childFolders);
  }, [props.childFolders]);

  const locationId = props.currentFolder ? String(props.currentFolder.id) : null;
  const listLabel = useMemo(
    () =>
      props.currentFolder
        ? props.t("assets:ASSET_FOLDER_PANEL_ORGANIZE_CHILDREN")
        : props.t("assets:ASSET_FOLDER_PANEL_ORGANIZE_ROOT"),
    [props.currentFolder, props.t],
  );

  const handleReorder = (nextFolders: AdminAssetFolder[]) => {
    const previousFolders = orderedFolders;
    setOrderedFolders(nextFolders);
    void props.onReorder(nextFolders).catch(() => {
      setOrderedFolders(previousFolders);
    });
  };

  return (
    <Frame className="h-full" variant="inverse" spacing="sm" stacked>
      <FolderOrganizerHeader
        t={props.t}
        currentFolder={props.currentFolder}
        currentPathText={props.currentPathText}
        childCount={props.childFolders.length}
        onCreateFolder={() => props.onCreateFolder(locationId)}
        onEditFolder={() => props.currentFolder && props.onEditFolder(props.currentFolder)}
        onMoveFolder={() => props.currentFolder && props.onMoveFolder(props.currentFolder)}
        onDeleteFolder={() => props.currentFolder && props.onDeleteFolder(props.currentFolder)}
      />

      {props.childFolders.length > 0 ? (
        <FramePanel className="min-h-0 flex-1 overflow-hidden">
          <FrameHeader>
            <FrameTitle className="text-footnote font-semibold text-foreground">
              {listLabel}
            </FrameTitle>
            <FrameDescription className="text-caption text-label-secondary">
              {props.t("assets:ASSET_FOLDER_PANEL_REORDER_DESC")}
            </FrameDescription>
          </FrameHeader>

          <div className="min-h-0 flex-1 overflow-auto">
            <Sortable
              value={orderedFolders}
              onValueChange={handleReorder}
              getItemValue={(folder) => String(folder.id)}
              strategy="vertical"
              className="flex flex-col gap-2"
            >
              {orderedFolders.map((folder) => (
                <SortableFolderItem
                  key={String(folder.id)}
                  folder={folder}
                  disabled={props.reorderPending}
                  t={props.t}
                  onSelect={() => props.onSelectFolder(String(folder.id))}
                />
              ))}
            </Sortable>
          </div>
        </FramePanel>
      ) : (
        <FolderOrganizerEmpty
          title={props.t("assets:ASSET_FOLDER_PANEL_ORGANIZE_EMPTY")}
          description={props.t("assets:ASSET_FOLDER_PANEL_ORGANIZE_EMPTY_DESC")}
          actionLabel={props.t("assets:ASSET_ACTION_CREATE_FOLDER")}
          onAction={() => props.onCreateFolder(locationId)}
        />
      )}
    </Frame>
  );
}
