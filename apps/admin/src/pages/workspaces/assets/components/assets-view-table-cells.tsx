import { Eye, MoreVertical } from "lucide-react";

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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@arclayer/ui/hover-card";

import type { AssetsViewController } from "../hooks/use-assets-view-controller";
import { buildAssetMoreMenuItems, handleAssetMoreAction } from "./asset-more-actions";
import { getMimeLabel, getPurposeLabel, getVisibilityLabel } from "./asset-masonry-tile";
import { LazyAssetImage } from "./lazy-asset-image";

const UNKNOWN_UPLOADER_FALLBACK = "-";
const HOVER_CARD_WIDTH_CLASSNAME = "w-[280px]";

export const ASSET_TABLE_SELECT_COLUMN_WIDTH = 56;
export const ASSET_TABLE_ACTIONS_COLUMN_WIDTH = 72;

function resolveUploaderName(
  asset: AssetMasonryItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return asset.uploaderName?.trim() || t("assets:ASSET_UPLOADER_UNKNOWN");
}

function resolveUploaderEmail(asset: AssetMasonryItem) {
  const email = asset.uploaderEmail?.trim();
  return email || null;
}

export function buildAssetFilenameSubtitle(
  asset: AssetMasonryItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const parts = [getMimeLabel(asset.mimeType, t), asset.sizeText || null].filter(Boolean);
  return parts.join(" · ") || UNKNOWN_UPLOADER_FALLBACK;
}

export function AssetPreviewCell(props: { asset: AssetMasonryItem; subtitle: string }) {
  const extensionLabel = (props.asset.ext || props.asset.mimeType || "file").replace(/^\./, "");

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted/25">
        {props.asset.previewUrl ? (
          <LazyAssetImage src={props.asset.previewUrl} alt={props.asset.name} fit="cover" />
        ) : (
          <span className="px-2 text-caption font-semibold uppercase text-label-secondary">
            {extensionLabel.slice(0, 4)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-foreground">{props.asset.name}</div>
        <div className="truncate text-footnote text-label-secondary">{props.subtitle}</div>
      </div>
    </div>
  );
}

export function AssetUploaderCell(props: {
  asset: AssetMasonryItem;
  t: (key: string, options?: Record<string, unknown>) => string;
  uploadedAtText: string;
}) {
  const uploaderName = resolveUploaderName(props.asset, props.t);
  const uploaderEmail = resolveUploaderEmail(props.asset);
  const uploadedAtLabel =
    props.uploadedAtText === UNKNOWN_UPLOADER_FALLBACK
      ? null
      : `${props.t("assets:ASSET_META_CREATED_AT")}: ${props.uploadedAtText}`;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1">
          <UserAvatar
            name={uploaderName}
            assetRef={props.asset.uploaderAvatarUrl}
            size={24}
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-body text-foreground">{uploaderName}</div>
            {uploaderEmail ? (
              <div className="truncate text-footnote text-label-secondary">{uploaderEmail}</div>
            ) : null}
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={8}
        className={`${HOVER_CARD_WIDTH_CLASSNAME} rounded-xl border bg-popover p-0 text-popover-foreground shadow-md`}
      >
        <div className="p-4 text-popover-foreground">
          <div className="flex items-start gap-3">
            <UserAvatar
              name={uploaderName}
              assetRef={props.asset.uploaderAvatarUrl}
              size={40}
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold text-foreground">{uploaderName}</div>
              {uploaderEmail ? (
                <div className="mt-1 truncate text-footnote text-label-secondary">
                  {uploaderEmail}
                </div>
              ) : null}
              {uploadedAtLabel ? (
                <div className="mt-2 text-footnote leading-5 text-label-secondary">
                  {uploadedAtLabel}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
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
  controller: AssetsViewController;
  onMoreAction: (
    key: Parameters<typeof handleAssetMoreAction>[0]["key"],
    asset: AssetMasonryItem,
  ) => void;
}) {
  const items = buildAssetMoreMenuItems({
    t: props.controller.t,
    asset: props.asset,
    publicUrl: props.asset.publicUrl || null,
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={props.controller.t("common:MORE") || "More"}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuIconItem
          icon={<Eye size={16} />}
          onSelect={() => props.onMoreAction("view_details", props.asset)}
        >
          {props.controller.t("assets:ASSET_ACTION_VIEW_DETAILS")}
        </DropdownMenuIconItem>
        <DropdownMenuSeparator />
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
