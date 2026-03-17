import { ArrowUpRight, Download, EllipsisVertical, Eye, Trash2 } from "lucide-react";

import type { ResolvedRecentAsset } from "@/lib/assets/assets-recent";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { cn } from "@arclayer/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { FileTypeIcon } from "@arclayer/ui/icons/file-type-icon";

import { downloadWithAuth } from "./asset-masonry-tile";

export type RecentLayoutMode = "single" | "multi";

const recentCardBaseClassName =
  "group relative overflow-hidden rounded-lg border text-card-foreground transition-all duration-300";

const recentCardInactiveClassName =
  "border-border/60 bg-card hover:border-border hover:-translate-y-[1px] dark:border-white/10 dark:bg-[#111111] dark:hover:border-white/16";
const recentCardActiveClassName = "border-border bg-card dark:border-white/18 dark:bg-[#161616]";
const recentTextShadowClassName =
  "[text-shadow:0_1px_2px_rgba(15,23,42,0.14)] dark:[text-shadow:0_1px_2px_rgba(255,255,255,0.14)]";
const recentMetaValueClassName = "text-callout text-label-primary/72 dark:text-white/74";
const recentMetaDescriptionClassName = "text-callout text-label-primary/62 dark:text-white/66";

function getRecentCardAccent(asset: AssetMasonryItem) {
  const mimeType = (asset.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "from-sky-400/14 via-cyan-200/6 to-transparent";
  if (mimeType === "application/pdf") return "from-red-500/16 via-red-400/8 to-transparent";
  if (mimeType.startsWith("video/")) {
    return "from-violet-500/16 via-fuchsia-400/8 to-transparent";
  }
  if (mimeType.includes("zip") || mimeType.includes("compressed")) {
    return "from-amber-400/12 via-orange-300/7 to-transparent";
  }
  return "from-slate-400/10 via-slate-300/6 to-transparent";
}

function RecentAssetBackdrop(props: { asset: AssetMasonryItem; compact?: boolean }) {
  const hasPreview = Boolean(props.asset.previewUrl);

  if (hasPreview) {
    return (
      <>
        <div
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.03]"
          style={{
            backgroundImage: `url(${props.asset.previewUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "left top",
            transformOrigin: "left top",
            opacity: props.compact ? 0.4 : 0.56,
            WebkitMaskImage:
              "linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(0,0,0,.98) 24%, rgba(0,0,0,.78) 52%, rgba(0,0,0,.35) 78%, rgba(0,0,0,0) 100%)",
            maskImage:
              "linear-gradient(135deg, rgba(0,0,0,1) 0%, rgba(0,0,0,.98) 24%, rgba(0,0,0,.78) 52%, rgba(0,0,0,.35) 78%, rgba(0,0,0,0) 100%)",
            filter: "saturate(1.04) contrast(1.06)",
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.22),transparent_26%)] opacity-80 dark:bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.10),transparent_26%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/4 via-white/8 to-white/18 dark:from-black/[0.04] dark:via-black/[0.10] dark:to-black/[0.32]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_0%,rgba(255,255,255,0.08)_22%,rgba(241,245,249,0.18)_44%,rgba(221,230,239,0.36)_68%,rgba(204,214,224,0.58)_100%)] dark:bg-[linear-gradient(90deg,rgba(8,8,8,0.10)_0%,rgba(8,8,8,0.14)_22%,rgba(8,8,8,0.24)_44%,rgba(8,8,8,0.44)_68%,rgba(8,8,8,0.70)_100%)]" />
      </>
    );
  }

  return (
    <>
      <div className={cn("absolute inset-0 bg-gradient-to-br", getRecentCardAccent(props.asset))} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.16),transparent_24%)] dark:bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.07),transparent_24%)]" />
      <div
        className={cn(
          "absolute left-6 top-5 opacity-[0.08]",
          props.compact ? "scale-[1.9]" : "scale-[2.2]",
        )}
      >
        <FileTypeIcon
          filename={props.asset.name}
          mimeType={props.asset.mimeType}
          theme="light"
          size={64}
          className="text-label-primary/80 dark:text-white/85"
        />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0.16)_26%,rgba(241,245,249,0.22)_50%,rgba(226,232,240,0.32)_72%,rgba(214,223,233,0.46)_100%)] dark:bg-[linear-gradient(90deg,rgba(8,8,8,0.06)_0%,rgba(8,8,8,0.10)_26%,rgba(8,8,8,0.18)_50%,rgba(8,8,8,0.36)_72%,rgba(8,8,8,0.60)_100%)]" />
    </>
  );
}

function RecentMetaLine(props: { sizeText?: string | null; lastOpenedText: string }) {
  return (
    <div
      className={cn("mt-1 flex flex-wrap items-center gap-x-3 gap-y-1", recentTextShadowClassName)}
    >
      {props.sizeText ? <span className={recentMetaValueClassName}>{props.sizeText}</span> : null}
      {props.sizeText ? <span className="size-1 rounded-full bg-border/90" /> : null}
      <span className={recentMetaDescriptionClassName}>{props.lastOpenedText}</span>
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
        <button
          type="button"
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-label-secondary opacity-0 transition hover:bg-accent/70 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100",
            recentTextShadowClassName,
          )}
          aria-label={props.t("common:MORE")}
        >
          <EllipsisVertical className="size-4" />
        </button>
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
      <div className={cn(recentCardBaseClassName, cardStateClassName, "min-h-[11.75rem]")}>
        <RecentAssetBackdrop asset={props.entry.asset} compact />
        <div className="relative flex h-full flex-col p-3.5">
          <div className="flex items-start justify-end">
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
            className="mt-5 flex flex-1 flex-col justify-end text-left"
          >
            <div
              className={cn(
                "line-clamp-2 text-headline font-semibold tracking-tight text-label-primary",
                recentTextShadowClassName,
              )}
            >
              {props.entry.asset.name}
            </div>
            <RecentMetaLine
              sizeText={props.entry.asset.sizeText}
              lastOpenedText={props.lastOpenedText}
            />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(recentCardBaseClassName, cardStateClassName, "min-h-[6.5rem]")}>
      <RecentAssetBackdrop asset={props.entry.asset} />
      <div className="relative flex items-start justify-between gap-3 p-3.5">
        <button
          type="button"
          onClick={() => props.onOpenAsset(props.entry.asset)}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className={cn(
              "truncate text-headline font-semibold tracking-tight text-label-primary",
              recentTextShadowClassName,
            )}
          >
            {props.entry.asset.name}
          </div>
          <RecentMetaLine
            sizeText={props.entry.asset.sizeText}
            lastOpenedText={props.lastOpenedText}
          />
        </button>

        <RecentAssetActions
          t={props.t}
          entry={props.entry}
          onOpenAsset={props.onOpenAsset}
          onRemoveRecentAsset={props.onRemoveRecentAsset}
        />
      </div>
    </div>
  );
}
