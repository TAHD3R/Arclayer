"use client";

import LiteYouTubeEmbed from "react-lite-youtube-embed";
import ReactPlayer from "react-player";

import type { TVideoElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { parseVideoUrl } from "@platejs/media";
import { useMediaState } from "@platejs/media/react";
import { ResizableProvider, useResizableValue } from "@platejs/resizable";
import { PlateElement, useEditorMounted, withHOC } from "platejs/react";

import { cn } from "@arclayer/lib/utils";

export const VideoElement = withHOC(
  ResizableProvider,
  function VideoElement(props: PlateElementProps<TVideoElement>) {
    const { embed, isVideo, isUpload, isYoutube, unsafeUrl } = useMediaState({
      urlParsers: [parseVideoUrl],
    });
    const width = useResizableValue("width");
    const mounted = useEditorMounted();
    const renderEmbedPlayer = mounted && !isUpload && !isYoutube && isVideo;
    const renderFileVideo = mounted && (isUpload || !isVideo);

    return (
      <PlateElement className="my-4" {...props}>
        <figure
          className="max-w-full overflow-hidden"
          contentEditable={false}
          style={width ? { width } : undefined}
        >
          {!isUpload && isYoutube ? (
            <LiteYouTubeEmbed
              id={embed?.id ?? ""}
              title="youtube"
              wrapperClass={cn("aspect-video bg-black")}
            />
          ) : null}
          {renderFileVideo ? (
            <video className="aspect-video w-full object-cover" src={unsafeUrl} controls />
          ) : null}
          {renderEmbedPlayer ? (
            <ReactPlayer width="100%" height="100%" src={unsafeUrl} controls />
          ) : null}
        </figure>
        {props.children}
      </PlateElement>
    );
  },
);
