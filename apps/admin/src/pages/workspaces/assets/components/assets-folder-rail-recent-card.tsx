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
  "group relative overflow-hidden rounded-lg border bg-[#111111] text-white shadow-[0_18px_50px_rgba(0,0,0,0.32)] transition-all duration-300";

const recentCardInactiveClassName =
  "border-white/10 bg-[#111111] hover:border-white/16 hover:-translate-y-[1px]";
const recentCardActiveClassName =
  "border-white/18 bg-[#161616] shadow-[0_20px_56px_rgba(0,0,0,0.36)]";

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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.10),transparent_26%)] opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/[0.04] via-black/[0.10] to-black/[0.32]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,8,0.08)_0%,rgba(8,8,8,0.12)_24%,rgba(8,8,8,0.22)_48%,rgba(8,8,8,0.44)_72%,rgba(8,8,8,0.68)_100%)]" />
        <div className="absolute inset-y-0 right-0 w-[46%] bg-[linear-gradient(135deg,rgba(10,10,10,0.02)_0%,rgba(10,10,10,0.10)_20%,rgba(10,10,10,0.24)_42%,rgba(10,10,10,0.46)_65%,rgba(10,10,10,0.72)_100%)] backdrop-blur-[1.5px]" />
      </>
    );
  }

  return (
    <>
      <div className={cn("absolute inset-0 bg-gradient-to-br", getRecentCardAccent(props.asset))} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(255,255,255,0.07),transparent_24%)]" />
      <div
        className={cn(
          "absolute left-7 top-6 opacity-[0.06]",
          props.compact ? "scale-[2.6]" : "scale-[3.1]",
        )}
      >
        <FileTypeIcon
          filename={props.asset.name}
          mimeType={props.asset.mimeType}
          theme="light"
          size={64}
          className="text-white/85"
        />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,8,0.04)_0%,rgba(8,8,8,0.08)_26%,rgba(8,8,8,0.18)_50%,rgba(8,8,8,0.36)_72%,rgba(8,8,8,0.58)_100%)]" />
      <div className="absolute inset-y-0 right-0 w-[42%] bg-[linear-gradient(135deg,rgba(10,10,10,0.00)_0%,rgba(10,10,10,0.10)_24%,rgba(10,10,10,0.24)_46%,rgba(10,10,10,0.42)_68%,rgba(10,10,10,0.62)_100%)] backdrop-blur-[1px]" />
    </>
  );
}

function RecentMetaLine(props: { sizeText?: string | null; lastOpenedText: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-white/74">
      {props.sizeText ? <span>{props.sizeText}</span> : null}
      {props.sizeText ? <span className="size-1 rounded-full bg-white/20" /> : null}
      <span className="text-white/58">{props.lastOpenedText}</span>
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
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-white/60 opacity-0 transition hover:bg-white/8 hover:text-white focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
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
            <div className="line-clamp-2 text-headline font-semibold tracking-tight text-white/[0.96] [text-shadow:0_1px_1px_rgba(0,0,0,0.28)]">
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
          <div className="truncate text-headline font-semibold tracking-tight text-white/[0.96] [text-shadow:0_1px_1px_rgba(0,0,0,0.28)]">
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
