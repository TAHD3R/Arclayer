"use client";

import type { TAudioElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useMediaState } from "@platejs/media/react";
import { ResizableProvider, useResizableValue } from "@platejs/resizable";
import { PlateElement, withHOC } from "platejs/react";

export const AudioElement = withHOC(
  ResizableProvider,
  function AudioElement(props: PlateElementProps<TAudioElement>) {
    const { unsafeUrl } = useMediaState();
    const width = useResizableValue("width");

    return (
      <PlateElement {...props} className="my-4">
        <figure
          className="max-w-full"
          contentEditable={false}
          style={width ? { width } : undefined}
        >
          <audio className="w-full" src={unsafeUrl} controls />
        </figure>
        {props.children}
      </PlateElement>
    );
  },
);
