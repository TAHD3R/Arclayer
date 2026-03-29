"use client";

import type { TFileElement } from "platejs";
import type { PlateElementProps } from "platejs/react";

import { useMediaState } from "@platejs/media/react";
import { ResizableProvider, useResizableValue } from "@platejs/resizable";
import { FileUp } from "lucide-react";
import { PlateElement, withHOC } from "platejs/react";

export const FileElement = withHOC(
  ResizableProvider,
  function FileElement(props: PlateElementProps<TFileElement>) {
    const { name, unsafeUrl } = useMediaState();
    const width = useResizableValue("width");

    return (
      <PlateElement className="my-3 rounded-sm" {...props}>
        <a
          className="inline-flex max-w-full items-center gap-2 rounded-lg px-1 py-1.5 text-footnote hover:bg-accent/40"
          contentEditable={false}
          download={name}
          href={unsafeUrl}
          rel="noopener noreferrer"
          target="_blank"
          style={width ? { width } : undefined}
        >
          <FileUp className="size-4 text-label-secondary" />
          <span className="truncate text-footnote text-label-primary">{name || unsafeUrl}</span>
        </a>
        {props.children}
      </PlateElement>
    );
  },
);
