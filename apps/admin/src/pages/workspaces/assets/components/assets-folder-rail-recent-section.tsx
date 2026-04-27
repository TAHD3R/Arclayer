import { EllipsisVertical, History, Trash2 } from "lucide-react";
import { useState } from "react";

import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Skeleton } from "@arclayer/ui/skeleton";

import { AssetsFolderRailEmptyCard } from "./assets-folder-rail-empty-card";
import { RecentAssetCard, type RecentLayoutMode } from "./assets-folder-rail-recent-card";
import type { ResolvedRecentAsset } from "@/lib/assets/assets-recent";
import type { AssetMasonryItem } from "@/types/assets-masonry";

type AssetsFolderRailRecentSectionProps = {
  t: (key: string, options?: Record<string, unknown>) => string;
  scope: AssetScopeRef | null;
  foldersLoading: boolean;
  activeAssetId?: string | null;
  recentAssets: ResolvedRecentAsset[];
  onOpenAsset: (asset: AssetMasonryItem) => void;
  onRemoveRecentAsset: (key: string) => void;
  onClearRecentAssets: () => void;
  standalone?: boolean;
};

function RecentFileRowSkeleton() {
  return (
    <div className="min-h-[6.5rem] rounded-lg border border-border/60 bg-card px-4 py-3.5 dark:border-white/8 dark:bg-[#101010]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-5 w-4/5 rounded-full bg-muted/80 dark:bg-white/10" />
          <Skeleton className="h-4 w-20 rounded-full bg-muted/65 dark:bg-white/8" />
          <Skeleton className="h-4 w-32 rounded-full bg-muted/65 dark:bg-white/8" />
        </div>
        <Skeleton className="size-10 rounded-full bg-muted/80 dark:bg-white/10" />
      </div>
    </div>
  );
}

function RecentFileGridSkeleton() {
  return (
    <div className="min-h-[11.75rem] rounded-lg border border-border/60 bg-card p-3.5 dark:border-white/8 dark:bg-[#101010]">
      <div className="flex items-start justify-end">
        <Skeleton className="size-8 rounded-full bg-muted/80 dark:bg-white/10" />
      </div>
      <div className="mt-6 space-y-3">
        <Skeleton className="h-5 w-4/5 rounded-full bg-muted/80 dark:bg-white/10" />
        <Skeleton className="h-4 w-16 rounded-full bg-muted/65 dark:bg-white/8" />
        <Skeleton className="h-4 w-full rounded-full bg-muted/65 dark:bg-white/8" />
      </div>
    </div>
  );
}

type RecentSectionBodyProps = AssetsFolderRailRecentSectionProps & {
  layoutMode: RecentLayoutMode;
  gridClassName: string;
  recentLoading: boolean;
};

function RecentSectionMenu(props: {
  t: AssetsFolderRailRecentSectionProps["t"];
  hasRecentAssets: boolean;
  layoutMode: RecentLayoutMode;
  onLayoutModeChange: (mode: RecentLayoutMode) => void;
  onClearRecentAssets: () => void;
}) {
  if (!props.hasRecentAssets) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={props.t("common:MORE")}>
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={props.layoutMode}
          onValueChange={(value) =>
            props.onLayoutModeChange(value === "multi" ? "multi" : "single")
          }
        >
          <DropdownMenuRadioItem value="single">
            {props.t("assets:ASSET_FOLDER_LAYOUT_SINGLE")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="multi">
            {props.t("assets:ASSET_FOLDER_LAYOUT_MULTI")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuIconItem
          icon={<Trash2 className="size-4" />}
          variant="destructive"
          onSelect={props.onClearRecentAssets}
        >
          {props.t("assets:ASSET_ACTION_CLEAR_RECENT")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RecentSectionBody(props: RecentSectionBodyProps) {
  const dateTime = useAdminDateTimeFormatter({
    projectId: props.scope?.type === "project" ? String(props.scope.id) : null,
  });

  if (props.recentLoading) {
    return (
      <div className={cn("grid gap-3", props.gridClassName)}>
        {Array.from({ length: 3 }).map((_, index) =>
          props.layoutMode === "single" ? (
            <RecentFileRowSkeleton key={index} />
          ) : (
            <RecentFileGridSkeleton key={index} />
          ),
        )}
      </div>
    );
  }

  if (props.recentAssets.length === 0) {
    return (
      <AssetsFolderRailEmptyCard
        title={props.t("assets:ASSET_RECENT_EMPTY")}
        description={props.t("assets:ASSET_RECENT_EMPTY_DESC")}
        icon={<History className="size-5" />}
      />
    );
  }

  return (
    <div className={cn("grid gap-3", props.gridClassName)}>
      {props.recentAssets.map((entry) => {
        const lastOpenedText = props.t("assets:ASSET_RECENT_LAST_OPENED", {
          value: dateTime.formatDateTime(entry.visitedAt),
        });

        return (
          <RecentAssetCard
            key={entry.key}
            t={props.t}
            entry={entry}
            layoutMode={props.layoutMode}
            isActive={props.activeAssetId === entry.asset.id}
            lastOpenedText={lastOpenedText}
            onOpenAsset={props.onOpenAsset}
            onRemoveRecentAsset={props.onRemoveRecentAsset}
          />
        );
      })}
    </div>
  );
}

export function AssetsFolderRailRecentSection(props: AssetsFolderRailRecentSectionProps) {
  const [layoutMode, setLayoutMode] = useState<RecentLayoutMode>("single");
  const recentLoading = props.foldersLoading && props.recentAssets.length === 0;
  const gridClassName = layoutMode === "single" ? "grid-cols-1" : "grid-cols-2";

  return (
    <section
      className={cn("space-y-3.5", props.standalone ? null : "mt-8 border-t border-border/50 pt-6")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-title3 text-label-primary">{props.t("assets:ASSET_RECENT_TITLE")}</div>
        <RecentSectionMenu
          t={props.t}
          hasRecentAssets={props.recentAssets.length > 0}
          layoutMode={layoutMode}
          onLayoutModeChange={setLayoutMode}
          onClearRecentAssets={props.onClearRecentAssets}
        />
      </div>

      <RecentSectionBody
        {...props}
        layoutMode={layoutMode}
        gridClassName={gridClassName}
        recentLoading={recentLoading}
      />
    </section>
  );
}
