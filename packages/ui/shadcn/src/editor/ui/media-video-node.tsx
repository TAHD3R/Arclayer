"use client";

import * as React from "react";

import LiteYouTubeEmbed from "react-lite-youtube-embed";
import ReactPlayer from "react-player";

import type { TVideoElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { parseVideoUrl } from "@platejs/media";
import { useMediaState } from "@platejs/media/react";
import { ResizableProvider, useResizableValue } from "@platejs/resizable";
import { PlateElement, useEditorMounted, withHOC } from "platejs/react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

import { MediaCaption } from "./media-caption";
import { MediaToolbar } from "./media-toolbar";
import { mediaResizeHandleVariants, Resizable, ResizeHandle } from "./resize-handle";

export const VideoElement = withHOC(
  ResizableProvider,
  function VideoElement(props: PlateElementProps<TVideoElement>) {
    const { t } = useTranslation("content");
    const {
      align = "center",
      embed,
      focused,
      isVideo,
      isUpload,
      isYoutube,
      selected,
      unsafeUrl,
    } = useMediaState({
      urlParsers: [parseVideoUrl],
    });
    const width = useResizableValue("width");
    const mounted = useEditorMounted();
    const renderEmbedPlayer = mounted && !isUpload && !isYoutube && isVideo;
    const renderFileVideo = mounted && (isUpload || !isVideo);
    const [editingCaption, setEditingCaption] = React.useState(false);
    const [hovering, setHovering] = React.useState(false);

    const stopPlayerSelection = React.useCallback((event: React.SyntheticEvent) => {
      event.stopPropagation();
    }, []);

    const stopVideoSurfacePlayback = React.useCallback((event: React.SyntheticEvent) => {
      event.preventDefault();
      event.stopPropagation();
    }, []);

    return (
      <PlateElement className="py-2.5" {...props}>
        <MediaToolbar
          compact
          hovering={hovering}
          supportsCaption
          url={unsafeUrl}
          showAlignment
          onCaptionToggle={() => setEditingCaption((value) => !value)}
        >
          <figure
            className="group/media relative m-0 w-full cursor-default"
            contentEditable={false}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Resizable
              align={align}
              options={{
                align,
                maxWidth: "100%",
                minWidth: 240,
              }}
              style={width ? { width } : undefined}
            >
              <ResizeHandle
                className={mediaResizeHandleVariants({ direction: "left" })}
                options={{ direction: "left" }}
              />

              <div
                className={cn(
                  "overflow-hidden rounded-md bg-black",
                  focused &&
                    selected &&
                    "ring-2 ring-primary/70 ring-offset-2 ring-offset-background",
                )}
              >
                {!isUpload && isYoutube ? (
                  <div
                    onMouseDownCapture={stopPlayerSelection}
                    onClickCapture={stopPlayerSelection}
                  >
                    <LiteYouTubeEmbed
                      id={embed?.id ?? ""}
                      title="youtube"
                      wrapperClass={cn("aspect-video bg-black")}
                    />
                  </div>
                ) : null}
                {renderFileVideo ? (
                  <div className="relative">
                    <video
                      className="aspect-video w-full object-cover"
                      src={unsafeUrl}
                      controls
                      onMouseDownCapture={stopPlayerSelection}
                      onClickCapture={stopPlayerSelection}
                    />
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 inset-y-0 bottom-12 z-10"
                      onMouseDown={stopVideoSurfacePlayback}
                      onClick={stopVideoSurfacePlayback}
                    />
                  </div>
                ) : null}
                {renderEmbedPlayer ? (
                  <div
                    className="aspect-video"
                    onMouseDownCapture={stopPlayerSelection}
                    onClickCapture={stopPlayerSelection}
                  >
                    <ReactPlayer width="100%" height="100%" src={unsafeUrl} controls />
                  </div>
                ) : null}
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
