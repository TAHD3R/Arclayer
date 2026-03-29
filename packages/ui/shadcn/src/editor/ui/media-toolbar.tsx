"use client";

import * as React from "react";

import type { PlateEditor } from "platejs/react";

import {
  FloatingMedia as FloatingMediaPrimitive,
  FloatingMediaStore,
  useFloatingMediaValue,
  useImagePreviewValue,
} from "@platejs/media/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  ExternalLink,
  Link2,
  Trash2,
} from "lucide-react";
import {
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
  useRemoveNodeButton,
  useSelected,
} from "platejs/react";

import { Button } from "@arclayer/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { Separator } from "@arclayer/ui/separator";
import { cn } from "@arclayer/lib/utils";

import { captureEditorSelection, runEditorTransformPreservingSelection } from "../transforms";

type MediaAlign = "center" | "left" | "right";

function MediaToolbarActionButton(
  props: React.ComponentProps<typeof Button> & { pressed?: boolean },
) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn(
        "size-8 rounded-lg text-label-secondary hover:text-label-primary",
        props.pressed && "bg-accent text-label-primary",
        props.className,
      )}
      {...props}
    />
  );
}

function updateMediaAlignment(editor: PlateEditor, align: MediaAlign) {
  editor.tf.setNodes({ align });
}

export function MediaToolbar(props: {
  children: React.ReactNode;
  url: string;
  supportsDownload?: boolean;
}) {
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const isFocusedLast = useFocusedLast();
  const selectionCollapsed = useEditorSelector(
    (currentEditor) => !currentEditor.api.isExpanded(),
    [],
  );
  const isImagePreviewOpen = useImagePreviewValue("isOpen", editor.id);
  const open = isFocusedLast && !readOnly && selected && selectionCollapsed && !isImagePreviewOpen;
  const isEditing = useFloatingMediaValue("isEditing");
  const element = useElement();
  const { props: buttonProps } = useRemoveNodeButton({ element });
  const align = (element as { align?: MediaAlign }).align ?? "center";
  const selectionRef = React.useRef(captureEditorSelection(editor));

  React.useEffect(() => {
    if (!open && isEditing) {
      FloatingMediaStore.set("isEditing", false);
    }
  }, [isEditing, open]);

  const applyAlign = React.useCallback(
    (nextAlign: MediaAlign) => {
      runEditorTransformPreservingSelection(
        editor,
        () => {
          updateMediaAlignment(editor, nextAlign);
        },
        {
          restoreSelection: false,
          selection: selectionRef.current,
        },
      );
    },
    [editor],
  );

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor asChild>{props.children}</PopoverAnchor>

      <PopoverContent
        className="w-auto rounded-xl border border-border/70 bg-card/96 p-1 backdrop-blur"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            restoreSelection: false,
            selection: selectionRef.current,
          });
        }}
      >
        {isEditing ? (
          <div className="flex w-[18rem] items-center gap-2 px-1">
            <FloatingMediaPrimitive.UrlInput
              className="h-8 w-full rounded-lg border border-border/70 bg-card px-3 text-footnote outline-none"
              placeholder="https://"
              options={{ plugin: { key: element.type } }}
            />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="flex items-center gap-0.5">
              <MediaToolbarActionButton
                pressed={align === "left"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectionRef.current = captureEditorSelection(editor);
                }}
                onClick={() => applyAlign("left")}
              >
                <AlignLeft className="size-4" />
              </MediaToolbarActionButton>
              <MediaToolbarActionButton
                pressed={align === "center"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectionRef.current = captureEditorSelection(editor);
                }}
                onClick={() => applyAlign("center")}
              >
                <AlignCenter className="size-4" />
              </MediaToolbarActionButton>
              <MediaToolbarActionButton
                pressed={align === "right"}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectionRef.current = captureEditorSelection(editor);
                }}
                onClick={() => applyAlign("right")}
              >
                <AlignRight className="size-4" />
              </MediaToolbarActionButton>
            </div>

            <Separator orientation="vertical" className="mx-1 h-6" />

            <FloatingMediaPrimitive.EditButton
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-lg text-label-secondary transition-colors hover:bg-accent hover:text-label-primary",
              )}
              onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
              }}
            >
              <Link2 className="size-4" />
            </FloatingMediaPrimitive.EditButton>

            <MediaToolbarActionButton asChild>
              <a href={props.url} rel="noreferrer" target="_blank">
                <ExternalLink className="size-4" />
              </a>
            </MediaToolbarActionButton>

            {props.supportsDownload ? (
              <MediaToolbarActionButton asChild>
                <a download href={props.url}>
                  <Download className="size-4" />
                </a>
              </MediaToolbarActionButton>
            ) : null}

            <Separator orientation="vertical" className="mx-1 h-6" />

            <MediaToolbarActionButton
              {...buttonProps}
              onMouseDown={(event) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
                buttonProps.onMouseDown?.(event);
              }}
            >
              <Trash2 className="size-4" />
            </MediaToolbarActionButton>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
