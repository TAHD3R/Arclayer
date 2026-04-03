"use client";

import * as React from "react";

import type { TElement } from "platejs";
import { useEditorRef, useElement } from "platejs/react";

import { cn } from "@arclayer/lib/utils";

export function MediaCaption(props: {
  editing?: boolean;
  onEditingChange?: (value: boolean) => void;
  placeholder: string;
}) {
  const editor = useEditorRef();
  const element = useElement() as TElement & { caption?: string };
  const textareaRef = React.useRef<HTMLInputElement | null>(null);
  const isComposingRef = React.useRef(false);
  const pendingCloseRef = React.useRef(false);
  const caption = typeof element.caption === "string" ? element.caption : "";
  const [draftCaption, setDraftCaption] = React.useState(caption);

  const commitCaption = React.useCallback(
    (nextCaption: string) => {
      const path = editor.api.findPath(element);
      if (!path || nextCaption === caption) return;
      editor.tf.setNodes<typeof element>({ caption: nextCaption }, { at: path });
    },
    [caption, editor, element],
  );

  React.useEffect(() => {
    if (!props.editing) return;
    textareaRef.current?.focus();
    textareaRef.current?.select();
  }, [props.editing]);

  React.useEffect(() => {
    if (isComposingRef.current) return;
    setDraftCaption(caption);
  }, [caption]);

  if (!props.editing && !caption) {
    return null;
  }

  return (
    <figcaption className="mt-3" contentEditable={false}>
      <input
        ref={textareaRef}
        data-plate-focus="true"
        value={draftCaption}
        onChange={(event) => {
          const nextCaption = event.target.value;
          setDraftCaption(nextCaption);
          if (!isComposingRef.current) {
            commitCaption(nextCaption);
          }
        }}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false;
          const nextCaption = event.currentTarget.value;
          setDraftCaption(nextCaption);
          commitCaption(nextCaption);
          if (pendingCloseRef.current) {
            pendingCloseRef.current = false;
            props.onEditingChange?.(false);
          }
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onBlur={(event) => {
          const nextCaption = event.currentTarget.value;
          setDraftCaption(nextCaption);
          if (isComposingRef.current) {
            pendingCloseRef.current = true;
            return;
          }
          commitCaption(nextCaption);
          props.onEditingChange?.(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitCaption(event.currentTarget.value);
            props.onEditingChange?.(false);
          }
        }}
        placeholder={props.placeholder}
        className={cn(
          "w-full bg-transparent text-center text-footnote text-label-secondary outline-none placeholder:text-label-tertiary",
          props.editing
            ? "rounded-md border border-border/70 px-3 py-2 text-left text-label-primary"
            : "px-1 py-0",
        )}
      />
    </figcaption>
  );
}
