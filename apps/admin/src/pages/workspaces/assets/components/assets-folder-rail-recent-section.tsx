import { ArrowUpRight, Download, EllipsisVertical, Eye, Trash2 } from "lucide-react";

import type { ResolvedRecentAsset } from "@/lib/assets/assets-recent";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import type { AssetScopeRef } from "@/lib/assets/asset-scope";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { FileTypeIcon } from "@arclayer/ui/icons/file-type-icon";
import { Skeleton } from "@arclayer/ui/skeleton";

import { downloadWithAuth } from "./asset-masonry-tile";
import { LazyAssetImage } from "./lazy-asset-image";

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

function RecentFileSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 shadow-sm">
      <Skeleton className="size-14 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="size-8 rounded-full" />
    </div>
  );
}

function RecentAssetMedia(props: { asset: AssetMasonryItem }) {
  if (props.asset.previewUrl) {
    return (
      <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted/45">
        <LazyAssetImage
          src={props.asset.previewUrl}
          alt={props.asset.name}
          fit="cover"
          rootClassName="absolute inset-0"
          className="size-full"
        />
      </div>
    );
  }

  return (
    <div className="grid size-14 shrink-0 place-items-center rounded-md border border-border/50 bg-muted/45">
      <FileTypeIcon
        filename={props.asset.name}
        mimeType={props.asset.mimeType}
        theme="auto"
        className="size-9"
      />
    </div>
  );
}

export function AssetsFolderRailRecentSection(props: AssetsFolderRailRecentSectionProps) {
  const dateTime = useAdminDateTimeFormatter({
    workspaceId: props.scope?.type === "workspace" ? String(props.scope.id) : null,
  });
  const recentLoading = props.foldersLoading && props.recentAssets.length === 0;

  return (
    <section className="mt-6 space-y-3 border-t border-border/50 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold text-foreground">
          {props.t("assets:ASSET_RECENT_TITLE")}
        </div>
        {props.recentAssets.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={props.t("common:MORE")}>
                <EllipsisVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuIconItem
                icon={<Trash2 className="size-4" />}
                variant="destructive"
                onSelect={props.onClearRecentAssets}
              >
                {props.t("assets:ASSET_ACTION_CLEAR_RECENT")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {recentLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <RecentFileSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!recentLoading && props.recentAssets.length === 0 ? (
        <Empty className="rounded-[22px] border border-dashed border-border/60 bg-muted/15 px-4 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Eye className="size-5" />
            </EmptyMedia>
            <EmptyTitle className="text-title3">{props.t("assets:ASSET_RECENT_EMPTY")}</EmptyTitle>
            <EmptyDescription>{props.t("assets:ASSET_RECENT_EMPTY_DESC")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!recentLoading && props.recentAssets.length > 0 ? (
        <div className="space-y-3">
          {props.recentAssets.map((entry) => (
            <div
              key={entry.key}
              className={cn(
                "group flex items-center gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm transition-colors duration-200",
                props.activeAssetId === entry.asset.id
                  ? "border-primary/30 bg-primary/5 shadow-[0_14px_32px_-24px_rgba(24,24,27,0.3)]"
                  : "border-border hover:border-border/80 hover:bg-accent/35 hover:shadow-md",
              )}
            >
              <button
                type="button"
                onClick={() => props.onOpenAsset(entry.asset)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <RecentAssetMedia asset={entry.asset} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold text-foreground">
                    {entry.asset.name}
                  </div>
                  <div className="mt-0.5 text-[12px] text-label-secondary">
                    {entry.asset.sizeText || "—"}
                  </div>
                  <div className="mt-1 text-[12px] text-label-secondary">
                    {props.t("assets:ASSET_RECENT_LAST_OPENED", {
                      value: dateTime.formatDateTime(entry.visitedAt),
                    })}
                  </div>
                </div>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 opacity-0 transition-all duration-200 group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={props.t("common:MORE")}
                  >
                    <EllipsisVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuIconItem
                    icon={<Eye className="size-4" />}
                    onSelect={() => props.onOpenAsset(entry.asset)}
                  >
                    {props.t("assets:ASSET_ACTION_OPEN")}
                  </DropdownMenuIconItem>
                  {entry.asset.publicUrl ? (
                    <DropdownMenuIconItem
                      icon={<ArrowUpRight className="size-4" />}
                      onSelect={() =>
                        window.open(entry.asset.publicUrl, "_blank", "noopener,noreferrer")
                      }
                    >
                      {props.t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB")}
                    </DropdownMenuIconItem>
                  ) : null}
                  {entry.asset.contentUrl ? (
                    <DropdownMenuIconItem
                      icon={<Download className="size-4" />}
                      onSelect={() => {
                        void downloadWithAuth({
                          url: entry.asset.contentUrl as string,
                          filename: entry.asset.name,
                        });
                      }}
                    >
                      {props.t("assets:ASSET_ACTION_DOWNLOAD")}
                    </DropdownMenuIconItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuIconItem
                    icon={<Trash2 className="size-4" />}
                    variant="destructive"
                    onSelect={() => props.onRemoveRecentAsset(entry.key)}
                  >
                    {props.t("assets:ASSET_ACTION_REMOVE_RECENT")}
                  </DropdownMenuIconItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
