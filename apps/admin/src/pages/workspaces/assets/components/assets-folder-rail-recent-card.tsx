import { ArrowUpRight, Download, EllipsisVertical, Eye, Trash2 } from "lucide-react";

import type { ResolvedRecentAsset } from "@/lib/assets/assets-recent";
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
import { FileTypeIcon } from "@arclayer/ui/icons/file-type-icon";

import { downloadWithAuth } from "./asset-masonry-tile";
import { LazyAssetImage } from "./lazy-asset-image";

export type RecentLayoutMode = "single" | "multi";

const recentCardClassName =
  "group rounded-lg border bg-card shadow-sm transition-colors duration-200";
const recentCardInactiveClassName = "border-border hover:border-border/80 hover:bg-accent/35";
const recentCardActiveClassName =
  "border-primary/40 bg-primary/5 shadow-[0_12px_30px_-22px_rgba(24,24,27,0.32)]";

function RecentAssetMedia(props: { asset: AssetMasonryItem; className?: string }) {
  if (props.asset.previewUrl) {
    return (
      <div
        className={cn("relative shrink-0 overflow-hidden rounded-md bg-muted/45", props.className)}
      >
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
    <div className={cn("grid shrink-0 place-items-center rounded-md bg-muted/45", props.className)}>
      <FileTypeIcon
        filename={props.asset.name}
        mimeType={props.asset.mimeType}
        theme="auto"
        className="size-9"
      />
    </div>
  );
}

function RecentAssetActions(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  entry: ResolvedRecentAsset;
  onOpenAsset: (asset: AssetMasonryItem) => void;
  onRemoveRecentAsset: (key: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 opacity-70 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          aria-label={props.t("common:MORE")}
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuIconItem
          icon={<Eye className="size-4" />}
          onSelect={() => props.onOpenAsset(props.entry.asset)}
        >
          {props.t("assets:ASSET_ACTION_OPEN")}
        </DropdownMenuIconItem>
        {props.entry.asset.publicUrl ? (
          <DropdownMenuIconItem
            icon={<ArrowUpRight className="size-4" />}
            onSelect={() =>
              window.open(props.entry.asset.publicUrl, "_blank", "noopener,noreferrer")
            }
          >
            {props.t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB")}
          </DropdownMenuIconItem>
        ) : null}
        {props.entry.asset.contentUrl ? (
          <DropdownMenuIconItem
            icon={<Download className="size-4" />}
            onSelect={() => {
              void downloadWithAuth({
                url: props.entry.asset.contentUrl as string,
                filename: props.entry.asset.name,
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
          onSelect={() => props.onRemoveRecentAsset(props.entry.key)}
        >
          {props.t("assets:ASSET_ACTION_REMOVE_RECENT")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RecentAssetCard(props: {
  t: (key: string, options?: Record<string, unknown>) => string;
  entry: ResolvedRecentAsset;
  layoutMode: RecentLayoutMode;
  isActive: boolean;
  lastOpenedText: string;
  onOpenAsset: (asset: AssetMasonryItem) => void;
  onRemoveRecentAsset: (key: string) => void;
}) {
  const cardStateClassName = props.isActive
    ? recentCardActiveClassName
    : recentCardInactiveClassName;

  if (props.layoutMode === "multi") {
    return (
      <div className={cn(recentCardClassName, cardStateClassName, "p-3")}>
        <div className="mb-2 flex items-start justify-end">
          <RecentAssetActions
            t={props.t}
            entry={props.entry}
            onOpenAsset={props.onOpenAsset}
            onRemoveRecentAsset={props.onRemoveRecentAsset}
          />
        </div>
        <button
          type="button"
          onClick={() => props.onOpenAsset(props.entry.asset)}
          className="block w-full text-left"
        >
          <RecentAssetMedia asset={props.entry.asset} className="aspect-[4/3] w-full" />
          <div className="mt-3">
            <div className="line-clamp-2 text-[14px] font-semibold text-foreground">
              {props.entry.asset.name}
            </div>
            <div className="mt-1 text-[12px] text-label-secondary">
              {props.entry.asset.sizeText || "—"}
            </div>
            <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-label-secondary">
              {props.lastOpenedText}
            </div>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(recentCardClassName, cardStateClassName, "flex items-center gap-3 px-3 py-3")}
    >
      <button
        type="button"
        onClick={() => props.onOpenAsset(props.entry.asset)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <RecentAssetMedia asset={props.entry.asset} className="size-16" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-semibold text-foreground">
            {props.entry.asset.name}
          </div>
          <div className="mt-0.5 text-[12px] text-label-secondary">
            {props.entry.asset.sizeText || "—"}
          </div>
          <div className="mt-1 text-[12px] text-label-secondary">{props.lastOpenedText}</div>
        </div>
      </button>

      <RecentAssetActions
        t={props.t}
        entry={props.entry}
        onOpenAsset={props.onOpenAsset}
        onRemoveRecentAsset={props.onRemoveRecentAsset}
      />
    </div>
  );
}
