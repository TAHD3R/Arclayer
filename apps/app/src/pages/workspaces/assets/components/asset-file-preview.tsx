import { useEffect, useMemo, useState, type ReactNode } from "react";

import { cn } from "@arclayer/lib/utils";
import {
  ExcelDocumentIcon,
  GdocDocumentIcon,
  HtmlDocumentIcon,
  PdfDocumentIcon,
  PptDocumentIcon,
  PsdDocumentIcon,
  TxtDocumentIcon,
  UnknownDocumentIcon,
  VideoDocumentIcon,
  WordDocumentIcon,
  ZipDocumentIcon,
} from "@arclayer/ui/icons/document-icons";

import type { AssetMasonryItem } from "@/types/assets-masonry";

import { LazyAssetImage, type LazyAssetImageLoadInfo } from "./lazy-asset-image";

function normalizeAssetExtension(asset: AssetMasonryItem): string {
  const raw = (asset.ext || asset.name.split(".").pop() || "").toLowerCase();
  return raw.replace(/[^a-z0-9]/g, "");
}

export function isAssetImage(asset: AssetMasonryItem): boolean {
  return Boolean(asset.mimeType?.toLowerCase().startsWith("image/"));
}

export function AssetFileTypeIcon(props: {
  asset: AssetMasonryItem;
  size: number;
  className?: string;
}) {
  const icon = useMemo(() => {
    const mime = (props.asset.mimeType || "").toLowerCase();
    const ext = normalizeAssetExtension(props.asset);
    const iconProps = { size: props.size };

    if (mime === "application/pdf" || ext === "pdf") return <PdfDocumentIcon {...iconProps} />;
    if (mime.startsWith("video/") || ext === "mp4" || ext === "mov" || ext === "webm") {
      return <VideoDocumentIcon {...iconProps} />;
    }
    if (mime === "text/plain" || ext === "txt") return <TxtDocumentIcon {...iconProps} />;
    if (mime === "text/html" || ext === "html" || ext === "htm") {
      return <HtmlDocumentIcon {...iconProps} />;
    }
    if (ext === "doc" || ext === "docx") return <WordDocumentIcon {...iconProps} />;
    if (ext === "xls" || ext === "xlsx" || ext === "csv")
      return <ExcelDocumentIcon {...iconProps} />;
    if (ext === "ppt" || ext === "pptx") return <PptDocumentIcon {...iconProps} />;
    if (ext === "psd") return <PsdDocumentIcon {...iconProps} />;
    if (ext === "zip" || ext === "7z" || ext === "rar") return <ZipDocumentIcon {...iconProps} />;
    if (ext === "gdoc") return <GdocDocumentIcon {...iconProps} />;
    return <UnknownDocumentIcon {...iconProps} />;
  }, [props.asset, props.size]);

  return (
    <span
      className={cn("inline-flex items-center justify-center", props.className)}
      data-asset-file-type-icon="true"
    >
      {icon}
    </span>
  );
}

export function AssetFilePreview(props: {
  asset: AssetMasonryItem;
  iconSize: number;
  className?: string;
  imageClassName?: string;
  fit?: "cover" | "contain";
  fallback?: ReactNode;
  showTypeBadge?: boolean;
  showErrorOverlay?: boolean;
  errorText?: string;
  retryText?: string;
  errorVariant?: "default" | "icon-only";
  errorFallback?: "default" | "file-type-icon";
  onLoaded?: (info: LazyAssetImageLoadInfo) => void;
  onError?: () => void;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const previewUrl = props.asset.previewUrl || null;

  useEffect(() => {
    setLoadFailed(false);
  }, [props.asset.previewUrl]);

  if (previewUrl) {
    const showTypeBadge =
      Boolean(props.showTypeBadge) && (!isAssetImage(props.asset) || loadFailed);

    return (
      <div className={cn("absolute inset-0", props.className)} data-asset-file-preview="image">
        <LazyAssetImage
          src={previewUrl}
          alt={props.asset.name}
          fit={props.fit ?? "cover"}
          className={props.imageClassName}
          showErrorOverlay={props.showErrorOverlay}
          errorText={props.errorText}
          retryText={props.retryText}
          errorVariant={props.errorVariant}
          onLoaded={(info) => {
            setLoadFailed(false);
            props.onLoaded?.(info);
          }}
          onError={() => {
            setLoadFailed(true);
            props.onError?.();
          }}
        />
        {loadFailed && props.errorFallback === "file-type-icon" ? (
          <div className="absolute inset-0 grid place-items-center bg-muted/25">
            <AssetFileTypeIcon asset={props.asset} size={props.iconSize} className="opacity-95" />
          </div>
        ) : null}
        {showTypeBadge ? (
          <div className="absolute left-3 top-3 flex size-9 items-center justify-center">
            <AssetFileTypeIcon asset={props.asset} size={26} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "absolute inset-0 grid place-items-center bg-black/5 dark:bg-white/5 text-label-secondary",
        props.className,
      )}
      data-asset-file-preview="icon"
    >
      <div className="flex flex-col items-center gap-3">
        <AssetFileTypeIcon asset={props.asset} size={props.iconSize} className="opacity-95" />
        {props.fallback}
      </div>
    </div>
  );
}
