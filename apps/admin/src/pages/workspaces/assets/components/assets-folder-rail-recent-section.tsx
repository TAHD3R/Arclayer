import { EllipsisVertical, Trash2 } from "lucide-react";
import { useState } from "react";

import { ContentGuard } from "@/components/common/content-guard";
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
};

function RecentFileRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm">
      <Skeleton className="size-16 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="size-8 rounded-full" />
    </div>
  );
}

function RecentFileGridSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <Skeleton className="aspect-[4/3] w-full rounded-md" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-full" />
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
    workspaceId: props.scope?.type === "workspace" ? String(props.scope.id) : null,
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
      <ContentGuard
        loading={false}
        empty
        variant="compact"
        className="py-2"
        emptyTitle={props.t("assets:ASSET_RECENT_EMPTY")}
        emptyDescription={props.t("assets:ASSET_RECENT_EMPTY_DESC")}
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
    <section className="mt-6 space-y-3 border-t border-border/50 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold text-foreground">
          {props.t("assets:ASSET_RECENT_TITLE")}
        </div>
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
