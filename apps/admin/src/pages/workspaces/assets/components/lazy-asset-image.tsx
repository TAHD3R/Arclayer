import { ImageOff, RotateCw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { SpinnerOverlay } from "@arclayer/ui/spinner";

const DEFAULT_IMAGE_ASPECT_RATIO = 4 / 3;

export type LazyAssetImageLoadInfo = {
  naturalWidth: number;
  naturalHeight: number;
  aspectRatio: number;
};

function buildLoadInfo(image: HTMLImageElement): LazyAssetImageLoadInfo {
  const naturalWidth = Number(image.naturalWidth || 0);
  const naturalHeight = Number(image.naturalHeight || 0);
  const aspectRatio =
    naturalWidth > 0 && naturalHeight > 0
      ? naturalWidth / naturalHeight
      : DEFAULT_IMAGE_ASPECT_RATIO;
  return { naturalWidth, naturalHeight, aspectRatio };
}

function syncSettledImage(params: {
  image: HTMLImageElement | null;
  loadKey: string;
  settledKeyRef: MutableRefObject<string | null>;
  setStatus: (status: "loaded" | "error") => void;
  onLoaded?: (info: LazyAssetImageLoadInfo) => void;
  onError?: () => void;
}) {
  const { image, loadKey, settledKeyRef, setStatus, onLoaded, onError } = params;
  if (!image?.complete || settledKeyRef.current === loadKey) return;

  settledKeyRef.current = loadKey;
  if (image.naturalWidth > 0) {
    setStatus("loaded");
    onLoaded?.(buildLoadInfo(image));
    return;
  }

  setStatus("error");
  onError?.();
}

function settleLoaded(params: {
  image: HTMLImageElement;
  loadKey: string;
  settledKeyRef: MutableRefObject<string | null>;
  setStatus: (status: "loaded" | "error") => void;
  onLoaded?: (info: LazyAssetImageLoadInfo) => void;
}) {
  const { image, loadKey, settledKeyRef, setStatus, onLoaded } = params;
  if (settledKeyRef.current === loadKey) return;
  settledKeyRef.current = loadKey;
  setStatus("loaded");
  onLoaded?.(buildLoadInfo(image));
}

function settleError(params: {
  loadKey: string;
  settledKeyRef: MutableRefObject<string | null>;
  setStatus: (status: "loaded" | "error") => void;
  onError?: () => void;
}) {
  const { loadKey, settledKeyRef, setStatus, onError } = params;
  if (settledKeyRef.current === loadKey) return;
  settledKeyRef.current = loadKey;
  setStatus("error");
  onError?.();
}

export function LazyAssetImage(props: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  rootClassName?: string;
  onLoaded?: (info: LazyAssetImageLoadInfo) => void;
  onError?: () => void;
  fit?: "cover" | "contain";
  showErrorOverlay?: boolean;
  errorText?: string;
  retryText?: string;
  errorVariant?: "default" | "icon-only";
}) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const settledKeyRef = useRef<string | null>(null);
  const onLoadedRef = useRef(props.onLoaded);
  const onErrorRef = useRef(props.onError);
  const [shouldLoad, setShouldLoad] = useState(Boolean(props.eager));
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">(
    props.eager ? "loading" : "idle",
  );
  const [reloadKey, setReloadKey] = useState(0);
  const loadKey = `${props.src}:${reloadKey}`;

  useEffect(() => {
    onLoadedRef.current = props.onLoaded;
  }, [props.onLoaded]);

  useEffect(() => {
    onErrorRef.current = props.onError;
  }, [props.onError]);

  useEffect(() => {
    if (props.eager) {
      setShouldLoad(true);
      return;
    }
    const element = rootRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { root: null, rootMargin: "600px", threshold: 0 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [props.eager]);

  useLayoutEffect(() => {
    settledKeyRef.current = null;
    if (!shouldLoad) return;
    const image = imageRef.current;
    if (!image?.complete) {
      setStatus("loading");
      return;
    }
    syncSettledImage({
      image,
      loadKey,
      settledKeyRef,
      setStatus,
      onLoaded: onLoadedRef.current,
      onError: onErrorRef.current,
    });
  }, [loadKey, shouldLoad]);

  const showErrorOverlay = Boolean(props.showErrorOverlay);
  const showLoading = status === "loading";
  const showError = status === "error";
  const errorVariant = props.errorVariant ?? "default";

  return (
    <div
      ref={rootRef}
      className={cn("absolute inset-0 bg-black/5 dark:bg-white/5", props.rootClassName)}
    >
      {shouldLoad ? (
        <img
          key={loadKey}
          ref={imageRef}
          src={props.src}
          alt={props.alt}
          draggable={false}
          decoding="async"
          className={cn(
            "absolute inset-0 block h-full w-full",
            props.fit === "contain" ? "object-contain bg-black/5" : "object-cover",
            showError ? "opacity-0" : undefined,
            props.className,
          )}
          onLoad={(event) => {
            settleLoaded({
              image: event.currentTarget,
              loadKey,
              settledKeyRef,
              setStatus,
              onLoaded: onLoadedRef.current,
            });
          }}
          onError={() => {
            settleError({
              loadKey,
              settledKeyRef,
              setStatus,
              onError: onErrorRef.current,
            });
          }}
        />
      ) : null}

      {showLoading ? (
        <SpinnerOverlay
          className="bg-background/40 backdrop-blur-[1px]"
          spinnerContainerClassName="border-0 bg-transparent p-0 shadow-none"
          spinnerClassName="size-5 text-label-secondary/80"
        />
      ) : null}

      {showError ? (
        <div className="absolute inset-0 grid place-items-center bg-muted/25">
          {errorVariant === "icon-only" ? (
            <div className="flex items-center justify-center text-label-secondary">
              <ImageOff className="size-4" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-label-secondary">
              <div className="rounded-full bg-background/70 p-3 shadow-sm">
                <ImageOff className="size-5" />
              </div>
              <div className="text-caption">
                {props.errorText || t("assets:ASSET_PREVIEW_LOAD_FAILED")}
              </div>
              {showErrorOverlay ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setStatus("loading");
                    setReloadKey((value) => value + 1);
                  }}
                >
                  <RotateCw size={16} />
                  {props.retryText || t("common:RETRY")}
                </Button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
