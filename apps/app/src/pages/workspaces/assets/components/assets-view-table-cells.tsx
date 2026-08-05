import { MoreVertical } from "lucide-react";

import { UserAvatar } from "@/components/common/entity-avatar";
import { AssetMimeTag, AssetPurposeTag, AssetVisibilityTag } from "@/components/ui/tags/asset-tags";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

import { buildAssetMoreMenuItems, handleAssetMoreAction } from "./asset-more-actions";
import { getMimeLabel, getPurposeLabel, getVisibilityLabel } from "./asset-masonry-tile";
import { AssetFilePreview } from "./asset-file-preview";

const UNKNOWN_UPLOADER_FALLBACK = "-";

export const ASSET_TABLE_SELECT_COLUMN_WIDTH = 56;
export const ASSET_TABLE_ACTIONS_COLUMN_WIDTH = 72;

function resolveUploaderName(
  asset: AssetMasonryItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return asset.uploaderName?.trim() || t("assets:ASSET_UPLOADER_UNKNOWN");
}

export function buildAssetFilenameSubtitle(
  asset: AssetMasonryItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const parts = [getMimeLabel(asset.mimeType, t), asset.sizeText || null].filter(Boolean);
  return parts.join(" · ") || UNKNOWN_UPLOADER_FALLBACK;
}

export function AssetPreviewCell(props: { asset: AssetMasonryItem; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/25">
        <AssetFilePreview
          asset={props.asset}
          iconSize={36}
          fit="cover"
          errorVariant="icon-only"
          errorFallback="file-type-icon"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-callout font-semibold text-label-primary">
          {props.asset.name}
        </div>
        <div className="truncate text-footnote text-label-secondary">{props.subtitle}</div>
      </div>
    </div>
  );
}

export function AssetUploaderCell(props: {
  asset: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const uploaderName = resolveUploaderName(props.asset, props.t);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1">
      <UserAvatar
        name={uploaderName}
        assetRef={props.asset.uploaderAvatarUrl}
        size={24}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-label-primary">{uploaderName}</div>
      </div>
    </div>
  );
}

export function AssetMimeCell(props: {
  asset: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const label = getMimeLabel(props.asset.mimeType, props.t);
  return <AssetMimeTag label={label} title={props.asset.mimeType ?? undefined} />;
}

export function AssetVisibilityCell(props: {
  asset: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const label = getVisibilityLabel(props.asset.visibility, props.t);
  return <AssetVisibilityTag visibility={props.asset.visibility} label={label} />;
}

export function AssetPurposeCell(props: {
  asset: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const label = getPurposeLabel(props.asset.purpose, props.t);
  return <AssetPurposeTag purpose={props.asset.purpose} label={label} />;
}

export function AssetActionsCell(props: {
  asset: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
  onMoreAction: (
    key: Parameters<typeof handleAssetMoreAction>[0]["key"],
    asset: AssetMasonryItem,
  ) => void;
}) {
  const items = buildAssetMoreMenuItems({
    t: props.t,
    asset: props.asset,
    publicUrl: props.asset.publicUrl || null,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={props.t("common:MORE") || "More"}>
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, index) =>
          item.type === "separator" ? (
            <DropdownMenuSeparator key={`sep:${index}`} />
          ) : (
            <DropdownMenuIconItem
              key={item.key}
              icon={item.icon}
              disabled={item.disabled}
              variant={item.variant === "destructive" ? "destructive" : "default"}
              onSelect={() => props.onMoreAction(item.key, props.asset)}
            >
              {item.label}
            </DropdownMenuIconItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
