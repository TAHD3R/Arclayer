import { useEffect, useMemo, useState, type MutableRefObject } from "react";

import { Button } from "@arclayer/ui/button";
import { Spinner } from "@arclayer/ui/spinner";

import type { AssetMasonryItem } from "@/types/assets-masonry";

import { buildAssetAuthHeaders, getAssetPreviewKind } from "./asset-preview-file-utils";
import { AssetPreviewPdfViewer } from "./asset-preview-pdf-viewer";
import { AssetPreviewTextViewer } from "./asset-preview-text-viewer";
import { LazyAssetImage } from "./lazy-asset-image";

function getImagePreviewSources(active: AssetMasonryItem, previewCandidates: string[]) {
  return Array.from(
    new Set(
      [active.contentUrl, ...previewCandidates].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );
}

function AssetUnsupportedPreview(props: {
  title: string;
  description: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  downloadUrl?: string;
  publicUrl?: string;
}) {
  return (
    <div className="grid h-full min-h-[320px] place-items-center bg-muted/10 px-8">
      <div className="max-w-md space-y-3 text-center">
        <div className="text-title3 font-semibold text-label-primary">{props.title}</div>
        <p className="text-footnote leading-6 text-label-secondary">{props.description}</p>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          {props.publicUrl ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(props.publicUrl, "_blank", "noopener,noreferrer")}
            >
              {props.t("assets:ASSET_ACTION_OPEN_IN_NEW_TAB")}
            </Button>
          ) : null}
          {props.downloadUrl ? (
            <Button
              size="sm"
              onClick={() => window.open(props.downloadUrl, "_blank", "noopener,noreferrer")}
            >
              {props.t("assets:ASSET_ACTION_DOWNLOAD")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssetImagePreview(props: AssetPreviewStageProps) {
  const candidates = useMemo(
    () => getImagePreviewSources(props.active, props.previewCandidates),
    [props.active, props.previewCandidates],
  );
  const preferredSrc = candidates[0] ?? null;
  const currentSrc = props.previewSrc || preferredSrc;
  const { resolvedSrc, isLoading, loadFailed } = useResolvedPreviewSource({
    source: currentSrc,
    requiresAuth: Boolean(
      currentSrc && props.active.contentUrl && currentSrc === props.active.contentUrl,
    ),
  });

  useEffect(() => {
    if (!preferredSrc) return;
    props.setPreviewSrc(preferredSrc);
  }, [preferredSrc, props.active.id, props.setPreviewSrc]);

  useEffect(() => {
    if (!currentSrc || !loadFailed) return;
    props.failedPreviewRef.current.add(currentSrc);
    const next = candidates.find((url) => !props.failedPreviewRef.current.has(url));
    props.setPreviewSrc(next && next !== currentSrc ? next : null);
  }, [candidates, currentSrc, loadFailed, props.failedPreviewRef, props.setPreviewSrc]);

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden bg-muted/10">
      <div className="relative h-full w-full">
        {resolvedSrc ? (
          <LazyAssetImage
            eager
            src={resolvedSrc}
            alt={props.active.name}
            fit="contain"
            rootClassName="!bg-transparent"
            className="bg-transparent"
            showErrorOverlay
            errorText={props.t("assets:ASSET_PREVIEW_LOAD_FAILED")}
            retryText={props.t("common:RETRY")}
            onLoaded={(info) => props.setPreviewAspectRatio(info.aspectRatio)}
            onError={() => {
              if (!currentSrc) return;
              props.failedPreviewRef.current.add(currentSrc);
              const next = candidates.find((url) => !props.failedPreviewRef.current.has(url));
              props.setPreviewSrc(next && next !== currentSrc ? next : null);
            }}
          />
        ) : isLoading ? (
          <div className="absolute inset-0 grid place-items-center bg-muted/10">
            <Spinner className="size-5 text-label-secondary" />
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-muted/15">
            <div className="text-footnote text-label-secondary">
              {props.t("assets:ASSET_PREVIEW_UNAVAILABLE")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function useResolvedPreviewSource(params: { source: string | null; requiresAuth: boolean }) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(params.source);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!params.source) {
      setResolvedSrc(null);
      setIsLoading(false);
      setLoadFailed(false);
      return;
    }
    if (!params.requiresAuth) {
      setResolvedSrc(params.source);
      setIsLoading(false);
      setLoadFailed(false);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setResolvedSrc(null);
    setIsLoading(true);
    setLoadFailed(false);

    fetch(params.source, {
      headers: buildAssetAuthHeaders(),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`image fetch failed: ${response.status}`);
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResolvedSrc(null);
        setIsLoading(false);
        setLoadFailed(true);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [params.requiresAuth, params.source]);

  return { resolvedSrc, isLoading, loadFailed };
}

type AssetPreviewStageProps = {
  active: AssetMasonryItem;
  activeAspectRatio: number;
  previewAspectRatio: number | null;
  setPreviewAspectRatio: (value: number | null) => void;
  previewSrc: string | null;
  setPreviewSrc: (value: string | null) => void;
  previewCandidates: string[];
  failedPreviewRef: MutableRefObject<Set<string>>;
  t: (key: string, options?: Record<string, unknown>) => string;
};

export function AssetPreviewStage(props: AssetPreviewStageProps) {
  const kind = getAssetPreviewKind(props.active);

  if (kind === "image") return <AssetImagePreview {...props} />;
  if (kind === "video" && props.active.contentUrl) {
    return (
      <div className="h-full min-h-[320px] overflow-hidden bg-black">
        <video
          className="h-full w-full object-contain"
          controls
          preload="metadata"
          src={props.active.contentUrl}
        />
      </div>
    );
  }
  if (kind === "audio" && props.active.contentUrl) {
    return (
      <div className="grid h-full min-h-[320px] place-items-center bg-muted/10 px-8">
        <audio
          className="w-full max-w-xl"
          controls
          preload="metadata"
          src={props.active.contentUrl}
        />
      </div>
    );
  }
  if (kind === "pdf") return <AssetPreviewPdfViewer active={props.active} t={props.t} />;
  if (
    kind === "code" ||
    kind === "json" ||
    kind === "markdown" ||
    kind === "svg" ||
    kind === "text"
  ) {
    return <AssetPreviewTextViewer active={props.active} t={props.t} />;
  }

  return (
    <AssetUnsupportedPreview
      title={props.t("assets:ASSET_PREVIEW_UNAVAILABLE")}
      description={props.t("assets:ASSET_PREVIEW_UNSUPPORTED_DESC")}
      t={props.t}
      downloadUrl={props.active.downloadUrl}
      publicUrl={props.active.publicUrl}
    />
  );
}
