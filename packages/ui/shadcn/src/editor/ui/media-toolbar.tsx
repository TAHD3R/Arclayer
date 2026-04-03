"use client";

import * as React from "react";

import type { PlateEditor } from "platejs/react";

import {
  FloatingMediaStore,
  submitFloatingMedia,
  useFloatingMediaValue,
  useImagePreviewValue,
} from "@platejs/media/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  CheckIcon,
  ChevronLeft,
  ExternalLink,
  Link2,
  MoreHorizontal,
  Type,
} from "lucide-react";
import { BlockMenuPlugin, BlockSelectionPlugin } from "@platejs/selection/react";
import {
  useEditorRef,
  useEditorSelector,
  useElement,
  useFocusedLast,
  useReadOnly,
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
  const { t } = useTranslation(["content", "common"]);
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const selected = useSelected();
  const isFocusedLast = useFocusedLast();
  const selectionCollapsed = useEditorSelector(
    (currentEditor) => !currentEditor.api.isExpanded(),
    [],
  );
  const isImagePreviewOpen = useImagePreviewValue("isOpen", editor.id);
  const element = useElement() as {
    align?: MediaAlign;
    id?: string;
    type: string;
    url?: string;
  };
  const isEditing = useFloatingMediaValue("isEditing");
  const open =
    !readOnly &&
    !isImagePreviewOpen &&
    ((isFocusedLast && selected && selectionCollapsed) || isEditing);
  const align = element.align ?? "center";
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const [urlDraft, setUrlDraft] = React.useState(props.url);

  const compact = props.compact ?? false;
  const showAlignment = props.showAlignment ?? !compact;
  const showExternalLink = props.showExternalLink ?? !compact;
  const canSubmitUrl = urlDraft.trim().length > 0;
  const mediaPlugin = React.useMemo(() => ({ key: element.type }), [element.type]);

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

  const openBlockMenu = React.useCallback(
    (target: HTMLElement) => {
      if (!element.id) return;

      editor.getApi(BlockSelectionPlugin).blockSelection.set([String(element.id)]);
      editor.getApi(BlockSelectionPlugin).blockSelection.focus();

      const rect = target.getBoundingClientRect();
      editor.getApi(BlockMenuPlugin).blockMenu.show(String(element.id), {
        x: rect.left,
        y: rect.bottom + 8,
      });
    },
    [editor, element.id],
  );

  const cancelEditing = React.useCallback(() => {
    setUrlDraft(props.url);
    FloatingMediaStore.actions.reset();
    runEditorTransformPreservingSelection(editor, () => undefined, {
      restoreSelection: false,
      selection: selectionRef.current,
    });
  }, [editor, props.url]);

  const submitEditing = React.useCallback(() => {
    if (!canSubmitUrl) return;

    FloatingMediaStore.set("url", urlDraft.trim());
    submitFloatingMedia(editor, {
      element: element as never,
      plugin: mediaPlugin as never,
    });
  }, [canSubmitUrl, editor, element, mediaPlugin, urlDraft]);

  React.useEffect(() => {
    if (isEditing) {
      setUrlDraft(props.url);
      FloatingMediaStore.set("url", props.url);
    }
  }, [element.id, isEditing, props.url]);

  React.useEffect(() => {
    if (!open && isEditing) {
      FloatingMediaStore.actions.reset();
      setUrlDraft(props.url);
    }
  }, [isEditing, open, props.url]);

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor asChild>{props.children}</PopoverAnchor>

      <PopoverContent
        className="w-auto rounded-md border border-border/70 bg-card/96 p-1 backdrop-blur"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const activeElement = document.activeElement as HTMLElement | null;
          if (activeElement?.dataset.plateFocus === "true") return;
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
              <MediaToolbarActionButton
                compact={compact}
                tooltip={t("CONTENT_LIBRARY_EDITOR_MEDIA_EDIT_LINK")}
                data-plate-focus="true"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectionRef.current = captureEditorSelection(editor);
                }}
                onClick={() => {
                  setUrlDraft(props.url);
                  FloatingMediaStore.set("url", props.url);
                  FloatingMediaStore.set("isEditing", true);
                }}
              >
                <Link2 className="size-4" />
                {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_EDIT_LINK")}</span> : null}
              </MediaToolbarActionButton>

              {props.supportsCaption ? (
                <MediaToolbarActionButton
                  compact={compact}
                  tooltip={t("CONTENT_LIBRARY_EDITOR_MEDIA_CAPTION")}
                  data-plate-focus="true"
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
                  <a href={props.url} rel="noreferrer" target="_blank" data-plate-focus="true">
                    <ExternalLink className="size-4" />
                    {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_OPEN")}</span> : null}
                  </a>
                </MediaToolbarActionButton>
              ) : null}

              <MediaToolbarActionButton
                compact={compact}
                tooltip={t("CONTENT_LIBRARY_EDITOR_MEDIA_BLOCK_MENU")}
                data-plate-focus="true"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectionRef.current = captureEditorSelection(editor);
                }}
                onClick={(event) => openBlockMenu(event.currentTarget)}
              >
                <MoreHorizontal className="size-4" />
                {compact ? <span>{t("CONTENT_LIBRARY_EDITOR_MEDIA_BLOCK_MENU")}</span> : null}
              </MediaToolbarActionButton>
            </>
          ) : null}
        </div>

        {isEditing ? (
          <div className="flex items-center gap-1 px-1 pb-1 pt-2">
            <MediaToolbarActionButton
              compact
              tooltip={t("common:BACK")}
              data-plate-focus="true"
              onMouseDown={(event) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
              }}
              onClick={cancelEditing}
            >
              <ChevronLeft className="size-4" />
            </MediaToolbarActionButton>

            <div className="flex min-w-[18rem] items-center gap-2 rounded-md border border-border/70 bg-card px-2.5">
              <Link2 className="size-4 text-label-secondary" />
              <input
                data-plate-focus="true"
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitEditing();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    cancelEditing();
                  }
                }}
                className="h-8 w-full bg-transparent text-footnote outline-none placeholder:text-label-tertiary"
                placeholder="https://"
              />
            </div>

            <MediaToolbarActionButton
              compact
              tooltip={t("common:CONFIRM")}
              data-plate-focus="true"
              disabled={!canSubmitUrl}
              onMouseDown={(event) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
              }}
              onClick={submitEditing}
            >
              <CheckIcon className="size-4" />
            </MediaToolbarActionButton>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
