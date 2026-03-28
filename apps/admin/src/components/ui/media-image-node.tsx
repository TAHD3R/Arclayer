"use client";

import type { TImageElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useMediaState } from "@platejs/media/react";
import { Resizable, ResizableProvider, ResizeHandle, useResizableValue } from "@platejs/resizable";
import { ImageOff } from "lucide-react";
import { PlateElement, withHOC } from "platejs/react";

import { LazyAssetImage } from "@/pages/workspaces/assets/components/lazy-asset-image";
import { cn } from "@arclayer/lib/utils";

function MediaResizeHandle(props: { direction: "left" | "right" }) {
  return (
    <ResizeHandle
      className={cn(
        "absolute top-1/2 z-20 hidden h-14 w-2 -translate-y-1/2 cursor-col-resize rounded-full bg-primary/85 group-hover/media:block",
        props.direction === "left" ? "-left-3" : "-right-3",
      )}
      options={{ direction: props.direction }}
    />
  );
}

export const MediaImageElement = withHOC(
  ResizableProvider,
  function MediaImageElement(props: PlateElementProps<TImageElement>) {
    const { align = "center", focused, selected } = useMediaState();
    const width = useResizableValue("width");
    const element = props.element as TImageElement & { url?: string };
    const url = typeof element.url === "string" ? element.url : "";

    return (
      <PlateElement {...props} as="div" className="group/media my-6">
        <figure
          className="relative m-0"
          contentEditable={false}
          style={{ width: width ?? undefined }}
        >
          <Resizable options={{ align }}>
            <MediaResizeHandle direction="left" />
            <div
              className={cn(
                "relative overflow-hidden bg-muted/20",
                focused &&
                  selected &&
                  "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
              )}
            >
              <div className="relative aspect-[16/9]">
                {url ? (
                  <LazyAssetImage
                    eager
                    src={url}
                    alt=""
                    rootClassName="absolute inset-0"
                    className="object-cover"
                    showErrorOverlay
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-label-secondary">
                    <ImageOff className="size-5" />
                  </div>
                )}
              </div>
            </div>
            <MediaResizeHandle direction="right" />
          </Resizable>
        </figure>
        {props.children}
      </PlateElement>
    );
  },
);
