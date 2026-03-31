"use client";

import * as React from "react";

import type { PlateEditor } from "platejs/react";

import {
  FloatingMedia as FloatingMediaPrimitive,
  useFloatingMediaValue,
  useImagePreviewValue,
} from "@platejs/media/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ExternalLink,
  Link2,
  Trash2,
  Type,
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
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { Separator } from "@arclayer/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

import { captureEditorSelection, runEditorTransformPreservingSelection } from "../transforms";

type MediaAlign = "center" | "left" | "right";

function MediaToolbarActionButton(
  props: React.ComponentProps<typeof Button> & {
    pressed?: boolean;
    compact?: boolean;
    tooltip?: React.ReactNode;
  },
) {
  const { compact, tooltip, ...buttonProps } = props;
  const content = (
    <Button
      type="button"
      size={compact ? "sm" : "icon-sm"}
      variant="ghost"
      className={cn(
        compact
          ? "h-8 rounded-md px-3 text-footnote text-label-secondary hover:text-label-primary"
          : "size-8 rounded-md text-label-secondary hover:text-label-primary",
        props.pressed && "bg-accent text-label-primary",
        props.className,
      )}
      {...buttonProps}
    />
  );

  if (!tooltip) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        {content}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function updateMediaAlignment(editor: PlateEditor, align: MediaAlign) {
  editor.tf.setNodes({ align });
}

export function MediaToolbar(props: {
  children: React.ReactNode;
  compact?: boolean;
  onCaptionToggle?: () => void;
  showAlignment?: boolean;
  showExternalLink?: boolean;
  supportsCaption?: boolean;
  url: string;
}) {
  const { t } = useTranslation("content");
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
  const element = useElement();
  const isEditing = useFloatingMediaValue("isEditing");
  const { props: buttonProps } = useRemoveNodeButton({ element });
  const align = (element as { align?: MediaAlign }).align ?? "center";
  const selectionRef = React.useRef(captureEditorSelection(editor));

  const compact = props.compact ?? false;
  const showAlignment = props.showAlignment ?? !compact;
  const showExternalLink = props.showExternalLink ?? !compact;

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
        className="w-auto rounded-md border border-border/70 bg-card/96 p-1 backdrop-blur"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            restoreSelection: false,
            selection: selectionRef.current,
          });
        }}
      >
        <div className="flex items-center gap-1">
          {!isEditing && showAlignment ? (
            <>
              <div className="flex items-center gap-0.5">
                <MediaToolbarActionButton
                  pressed={align === "left"}
                  tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}
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
                  tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}
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
                  tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}
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
            </>
          ) : null}

          {!isEditing ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild focusTrigger={false}>
                  <FloatingMediaPrimitive.EditButton
                    className={cn(
                      compact
                        ? "inline-flex h-8 items-center gap-2 rounded-md px-3 text-footnote font-semibold text-label-secondary transition-colors hover:bg-accent hover:text-label-primary"
                        : "inline-flex size-8 items-center justify-center rounded-md text-label-secondary transition-colors hover:bg-accent hover:text-label-primary",
                    )}
                    onMouseDown={(event: React.MouseEvent<HTMLButtonElement>) => {
                      event.preventDefault();
                      selectionRef.current = captureEditorSelection(editor);
                    }}
                  >
                    <Link2 className="size-4" />
                    {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_EDIT_LINK")}</span> : null}
                  </FloatingMediaPrimitive.EditButton>
                </TooltipTrigger>
                <TooltipContent>{t("CONTENT_LIBRARY_EDITOR_MEDIA_EDIT_LINK")}</TooltipContent>
              </Tooltip>

              {props.supportsCaption ? (
                <MediaToolbarActionButton
                  compact={compact}
                  tooltip={t("CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION")}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectionRef.current = captureEditorSelection(editor);
                  }}
                  onClick={props.onCaptionToggle}
                >
                  <Type className="size-4" />
                  {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION")}</span> : null}
                </MediaToolbarActionButton>
              ) : null}

              {showExternalLink ? (
                <MediaToolbarActionButton
                  compact={compact}
                  tooltip={t("CONTENT_LIBRARY_EDITOR_MEDIA_OPEN")}
                  asChild
                >
                  <a href={props.url} rel="noreferrer" target="_blank">
                    <ExternalLink className="size-4" />
                    {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_OPEN")}</span> : null}
                  </a>
                </MediaToolbarActionButton>
              ) : null}

              <MediaToolbarActionButton
                compact={compact}
                tooltip={t("CONTENT_LIBRARY_EDITOR_MEDIA_DELETE")}
                {...buttonProps}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectionRef.current = captureEditorSelection(editor);
                  buttonProps.onMouseDown?.(event);
                }}
              >
                <Trash2 className="size-4" />
                {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_DELETE")}</span> : null}
              </MediaToolbarActionButton>
            </>
          ) : null}
        </div>

        {isEditing ? (
          <div className="px-1 pb-1 pt-2">
            <FloatingMediaPrimitive.UrlInput
              className="h-8 w-[18rem] rounded-md border border-border/70 bg-card px-3 text-footnote outline-none"
              placeholder="https://"
              options={{ plugin: { key: element.type } }}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
