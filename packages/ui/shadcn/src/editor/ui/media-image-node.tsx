"use client";

import * as React from "react";

import type { TImageElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useMediaState } from "@platejs/media/react";
import { ResizableProvider, useResizableValue } from "@platejs/resizable";
import { ImageOff } from "lucide-react";
import { PlateElement, withHOC } from "platejs/react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

import { MediaCaption } from "./media-caption";
import { MediaToolbar } from "./media-toolbar";
import { mediaResizeHandleVariants, Resizable, ResizeHandle } from "./resize-handle";

export const MediaImageElement = withHOC(
  ResizableProvider,
  function MediaImageElement(props: PlateElementProps<TImageElement>) {
    const { t } = useTranslation("content");
    const { align = "center", focused, selected } = useMediaState();
    const width = useResizableValue("width");
    const element = props.element as TImageElement & { url?: string };
    const url = typeof element.url === "string" ? element.url : "";
    const [editingCaption, setEditingCaption] = React.useState(false);

    return (
      <PlateElement {...props} as="div" className="group/media py-2.5">
        <MediaToolbar
          compact
          supportsCaption
          url={url}
          showAlignment
          showExternalLink
          onCaptionToggle={() => setEditingCaption((value) => !value)}
        >
          <figure
            className="group/media relative m-0 w-full cursor-default"
            contentEditable={false}
          >
            <Resizable
              align={align}
              options={{
                align,
                maxWidth: "100%",
                minWidth: 180,
              }}
              style={width ? { width } : undefined}
            >
              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: "left" })}
                options={{ direction: "left" }}
              />
              <div
                className={cn(
                  "relative overflow-hidden rounded-md bg-muted/20",
                  focused &&
                    selected &&
                    "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
                )}
              >
                <div className="relative aspect-[16/9]">
                  {url ? (
                    <img
                      className="absolute inset-0 h-full w-full object-cover"
                      src={url}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-label-secondary">
                      <ImageOff className="size-5" />
                    </div>
                  )}
                </div>
              </div>
              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: "right" })}
                options={{ direction: "right" }}
              />
            </Resizable>
            <MediaCaption
              editing={editingCaption}
              onEditingChange={setEditingCaption}
              placeholder={t("CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION_PLACEHOLDER")}
            />
          </figure>
        </MediaToolbar>
        {props.children}
      </PlateElement>
    );
  },
);
