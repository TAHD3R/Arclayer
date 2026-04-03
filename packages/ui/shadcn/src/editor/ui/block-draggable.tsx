"use client";

import * as React from "react";

import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import {
  BlockMenuPlugin,
  BlockSelectionPlugin,
  useBlockSelectable,
  useBlockSelected,
  useIsSelecting,
} from "@platejs/selection/react";
import { GripVertical, Plus } from "lucide-react";
import { type TElement, getPluginByType, isType, KEYS } from "platejs";
import {
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
  MemoizedChildren,
  useEditorRef,
  useEditorSelector,
  useElement,
  usePluginOption,
} from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  applyArticleEditorInsertItem,
  getArticleEditorInsertGroups,
} from "../article-editor-insert-items";
import { useArticleEditorCommands } from "../article-editor-command-context";
import { ArticleEditorInsertMenuContent } from "../article-editor-insert-menu";
import { Button } from "@arclayer/ui/button";
import { DropdownMenu, DropdownMenuTrigger } from "@arclayer/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

const UNDRAGGABLE_KEYS = [KEYS.column, KEYS.tr, KEYS.td];
const INDENT_OFFSET_PX = 24;

function getBlockWrapperStyle(element: TElement): React.CSSProperties {
  const isListItem =
    ("listStyleType" in element && typeof element.listStyleType === "string") ||
    ("checked" in element && typeof element.checked === "boolean");

  const indent =
    !isListItem && "indent" in element && typeof element.indent === "number"
      ? element.indent
      : undefined;
  const indentOffset = indent && indent > 0 ? indent * INDENT_OFFSET_PX : 0;

  return {
    width: "calc(100% + var(--article-editor-inline-padding, 0px) * 2)",
    marginLeft: `calc(var(--article-editor-inline-padding, 0px) * -1 + ${indentOffset}px)`,
    marginRight: "calc(var(--article-editor-inline-padding, 0px) * -1)",
    paddingLeft: "var(--article-editor-inline-padding, 0px)",
    paddingRight: "var(--article-editor-inline-padding, 0px)",
  };
}

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const enabled = React.useMemo(() => {
    if (editor.dom.readOnly) return false;

    const isInsideTable = Boolean(
      editor.api.block({
        above: true,
        at: path,
        match: { type: editor.getType(KEYS.table) },
      }),
    );

    if (isInsideTable && path.length > 1) {
      return false;
    }

    if (path.length === 1 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      return true;
    }
    if (path.length === 3 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      const block = editor.api.some({
        at: path,
        match: {
          type: editor.getType(KEYS.column),
        },
      });

      if (block) {
        return true;
      }
    }

    return false;
  }, [editor, element, path]);

  if (!enabled) return;

  return (props) => <Draggable {...props} />;
};

function BlockInsertMenu(props: { editor: PlateEditor; path: PlateElementProps["path"] }) {
  const { t } = useTranslation("content");
  const commands = useArticleEditorCommands();
  const [open, setOpen] = React.useState(false);
  const groups = React.useMemo(() => getArticleEditorInsertGroups(t), [t]);

  const insertAtCurrentBlock = React.useCallback(
    (value: string) => {
      const point = props.editor.api.end(props.path);
      if (point) {
        props.editor.tf.select(point);
      }
      props.editor.tf.focus();
      if (commands?.insertItem) {
        commands.insertItem(props.editor, value);
      } else {
        applyArticleEditorInsertItem(props.editor, value);
      }
      setOpen(false);
    },
    [commands, props.editor, props.path],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
      }}
      modal={false}
    >
      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 rounded-md text-label-secondary hover:bg-accent/70 hover:text-label-primary"
              data-plate-prevent-deselect
              onMouseDown={(event) => event.preventDefault()}
            >
              <Plus className="size-3" />
              <span className="sr-only">{t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}</span>
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}</TooltipContent>
      </Tooltip>

      <ArticleEditorInsertMenuContent
        groups={groups}
        onSelectItem={insertAtCurrentBlock}
        align="start"
        side="right"
        sideOffset={12}
        className="w-[16rem]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      />
    </DropdownMenu>
  );
}

function Draggable(props: PlateElementProps) {
  const { children, editor, element, path } = props;
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;
  const selectable = useBlockSelectable();
  const blockSelected = useBlockSelected();

  const { isAboutToDrag, isDragging, nodeRef, previewRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;

      if (blockSelectionApi) {
        blockSelectionApi.add(id);
      }
      resetPreview();
    },
  });

  const isInColumn = path.length === 3;
  const isInTable = path.length === 4;

  const [previewTop, setPreviewTop] = React.useState(0);

  const resetPreview = () => {
    if (previewRef.current) {
      previewRef.current.replaceChildren();
      previewRef.current?.classList.add("hidden");
    }
  };

  // clear up virtual multiple preview when drag end
  React.useEffect(() => {
    if (!isDragging) {
      resetPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  React.useEffect(() => {
    if (isAboutToDrag) {
      previewRef.current?.classList.remove("opacity-0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAboutToDrag]);

  const [dragButtonTop, setDragButtonTop] = React.useState(0);
  const { t } = useTranslation("content");

  const openBlockMenu = React.useCallback(
    (target: HTMLElement) => {
      if (!element.id) return;

      const selectedBlocks = blockSelectionApi.getNodes({ sort: true });
      const selectedIds = selectedBlocks.map(([node]) => String(node.id ?? ""));
      const targetId = String(element.id);

      if (!selectedIds.includes(targetId)) {
        blockSelectionApi.set([targetId]);
      }

      blockSelectionApi.focus();

      const rect = target.getBoundingClientRect();
      editor.getApi(BlockMenuPlugin).blockMenu.show(targetId, {
        x: rect.left,
        y: rect.bottom + 8,
      });
    },
    [blockSelectionApi, editor, element.id],
  );

  return (
    <div
      className={cn(
        "relative",
        isDragging && "opacity-50",
        getPluginByType(editor, element.type)?.node.isContainer ? "group/container" : "group",
      )}
      onMouseEnter={() => {
        if (isDragging) return;
        setDragButtonTop(calcDragButtonTop(editor, element));
      }}
    >
      {!isInTable && (
        <Gutter>
          <div className={cn("slate-blockToolbarWrapper", "flex h-[1.5em]", isInColumn && "h-4")}>
            <div
              className={cn(
                "slate-blockToolbar pointer-events-auto relative mr-2 w-11",
                "flex items-center",
                isInColumn && "mr-1 w-8",
              )}
            >
              <div
                className="absolute left-0 flex w-auto items-center gap-0.5"
                style={{ top: `${dragButtonTop + 2}px` }}
              >
                <BlockInsertMenu editor={editor} path={path} />
                <Tooltip>
                  <TooltipTrigger asChild focusTrigger={false}>
                    <Button
                      ref={handleRef}
                      size="icon-xs"
                      variant="ghost"
                      type="button"
                      className="size-5 rounded-md text-label-secondary hover:bg-accent/70 hover:text-label-primary"
                      data-plate-prevent-deselect
                      onClick={(e) => {
                        e.preventDefault();
                        if (isDragging || isAboutToDrag) return;
                        openBlockMenu(e.currentTarget);
                      }}
                      onMouseDown={(e) => {
                        resetPreview();

                        if ((e.button !== 0 && e.button !== 2) || e.shiftKey) return;

                        const blockSelection = editor
                          .getApi(BlockSelectionPlugin)
                          .blockSelection.getNodes({ sort: true });

                        let selectionNodes =
                          blockSelection.length > 0
                            ? blockSelection
                            : editor.api.blocks({ mode: "highest" });

                        if (!selectionNodes.some(([node]) => node.id === element.id)) {
                          selectionNodes = [[element, editor.api.findPath(element)!]];
                        }

                        const blocks = selectionNodes.map(([node]) => node);

                        if (blockSelection.length === 0) {
                          editor.tf.blur();
                          editor.tf.collapse();
                        }

                        const elements = createDragPreviewElements(editor, blocks);
                        previewRef.current?.append(...elements);
                        previewRef.current?.classList.remove("hidden");
                        previewRef.current?.classList.add("opacity-0");
                        editor.setOption(DndPlugin, "multiplePreviewRef", previewRef);

                        editor
                          .getApi(BlockSelectionPlugin)
                          .blockSelection.set(blocks.map((block) => block.id as string));
                      }}
                      onMouseEnter={() => {
                        if (isDragging) return;

                        const blockSelection = editor
                          .getApi(BlockSelectionPlugin)
                          .blockSelection.getNodes({ sort: true });

                        let selectedBlocks =
                          blockSelection.length > 0
                            ? blockSelection
                            : editor.api.blocks({ mode: "highest" });

                        if (!selectedBlocks.some(([node]) => node.id === element.id)) {
                          selectedBlocks = [[element, editor.api.findPath(element)!]];
                        }

                        const ids = selectedBlocks.map((block) => block[0].id as string);

                        if (ids.length > 1 && ids.includes(element.id as string)) {
                          const previewTop = calculatePreviewTop(editor, {
                            blocks: selectedBlocks.map((block) => block[0]),
                            element,
                          });
                          setPreviewTop(previewTop);
                        } else {
                          setPreviewTop(0);
                        }
                      }}
                      onMouseUp={() => {
                        resetPreview();
                      }}
                    >
                      <GripVertical className="size-3 text-label-secondary" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("CONTENT_LIBRARY_EDITOR_DRAG_TO_MOVE")}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </Gutter>
      )}

      <div
        ref={previewRef}
        className={cn("-left-0 absolute hidden w-full")}
        style={{ top: `${-previewTop}px` }}
        contentEditable={false}
      />

      <div
        ref={nodeRef}
        data-block-id={element.id ? String(element.id) : undefined}
        data-plate-selectable="true"
        className={cn(
          "slate-blockWrapper relative isolate my-0.5 w-full",
          selectable.props.className,
        )}
        style={getBlockWrapperStyle(element)}
        onContextMenu={(event) => {
          event.preventDefault();
          selectable.props.onContextMenu?.(event);
          if (!element.id) return;

          editor.getApi(BlockMenuPlugin).blockMenu.showContextMenu(String(element.id), {
            x: event.clientX,
            y: event.clientY,
          });
        }}
      >
        <div
          className={cn(
            "relative w-full rounded-md transition-colors",
            blockSelected &&
              "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-md before:bg-brand/8 before:ring-1 before:ring-brand/20 before:content-['']",
          )}
        >
          <MemoizedChildren>{children}</MemoizedChildren>
          <DropLine />
        </div>
      </div>
    </div>
  );
}

function Gutter({ children, className, ...props }: React.ComponentProps<"div">) {
  const editor = useEditorRef();
  const element = useElement();
  const hasExpandedSelection = useEditorSelector(
    (currentEditor) => currentEditor.api.isExpanded(),
    [],
  );
  const isSelecting = useIsSelecting();
  const isSelectionAreaVisible = usePluginOption(BlockSelectionPlugin, "isSelectionAreaVisible");
  const blockSelected = useBlockSelected();

  return (
    <div
      {...props}
      className={cn(
        "slate-gutterLeft",
        "pointer-events-none absolute left-0 top-0 z-[70] flex h-full -translate-x-[calc(100%+0.125rem)] cursor-text hover:opacity-100 sm:opacity-0",
        getPluginByType(editor, element.type)?.node.isContainer
          ? "group-hover/container:opacity-100"
          : "group-hover:opacity-100",
        (isSelectionAreaVisible || (isSelecting && !blockSelected) || hasExpandedSelection) &&
          "hidden",
        blockSelected && "opacity-100",
        className,
      )}
      contentEditable={false}
    >
      {children}
    </div>
  );
}

const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine",
        "absolute inset-x-0 h-0.5 opacity-100 transition-opacity",
        "bg-brand/50",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
        className,
      )}
    />
  );
});

const createDragPreviewElements = (editor: PlateEditor, blocks: TElement[]): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  const ids: string[] = [];

  /**
   * Remove data attributes from the element to avoid recognized as slate
   * elements incorrectly.
   */
  const removeDataAttributes = (element: HTMLElement) => {
    Array.from(element.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-slate") || attr.name.startsWith("data-block-id")) {
        element.removeAttribute(attr.name);
      }
    });

    Array.from(element.children).forEach((child) => {
      removeDataAttributes(child as HTMLElement);
    });
  };

  const resolveElement = (node: TElement, index: number) => {
    const domNode = editor.api.toDOMNode(node)!;
    const newDomNode = domNode.cloneNode(true) as HTMLElement;

    // Apply visual compensation for horizontal scroll
    const applyScrollCompensation = (original: Element, cloned: HTMLElement) => {
      const scrollLeft = original.scrollLeft;

      if (scrollLeft > 0) {
        // Create a wrapper to handle the scroll offset
        const scrollWrapper = document.createElement("div");
        scrollWrapper.style.overflow = "hidden";
        scrollWrapper.style.width = `${original.clientWidth}px`;

        // Create inner container with the full content
        const innerContainer = document.createElement("div");
        innerContainer.style.transform = `translateX(-${scrollLeft}px)`;
        innerContainer.style.width = `${original.scrollWidth}px`;

        // Move all children to the inner container
        while (cloned.firstChild) {
          innerContainer.append(cloned.firstChild);
        }

        // Apply the original element's styles to maintain appearance
        const originalStyles = window.getComputedStyle(original);
        cloned.style.padding = "0";
        innerContainer.style.padding = originalStyles.padding;

        scrollWrapper.append(innerContainer);
        cloned.append(scrollWrapper);
      }
    };

    applyScrollCompensation(domNode, newDomNode);

    ids.push(node.id as string);
    const wrapper = document.createElement("div");
    wrapper.append(newDomNode);
    wrapper.style.display = "flow-root";

    const lastDomNode = blocks[index - 1];

    if (lastDomNode) {
      const lastDomNodeRect = editor.api
        .toDOMNode(lastDomNode)!
        .parentElement!.getBoundingClientRect();

      const domNodeRect = domNode.parentElement!.getBoundingClientRect();

      const distance = domNodeRect.top - lastDomNodeRect.bottom;

      // Check if the two elements are adjacent (touching each other)
      if (distance > 15) {
        wrapper.style.marginTop = `${distance}px`;
      }
    }

    removeDataAttributes(newDomNode);
    elements.push(wrapper);
  };

  blocks.forEach((node, index) => {
    resolveElement(node, index);
  });

  editor.setOption(DndPlugin, "draggingId", ids);

  return elements;
};

const calculatePreviewTop = (
  editor: PlateEditor,
  {
    blocks,
    element,
  }: {
    blocks: TElement[];
    element: TElement;
  },
): number => {
  const child = editor.api.toDOMNode(element)!;
  const editable = editor.api.toDOMNode(editor)!;
  const firstSelectedChild = blocks[0];

  const firstDomNode = editor.api.toDOMNode(firstSelectedChild)!;
  // Get editor's top padding
  const editorPaddingTop = Number(window.getComputedStyle(editable).paddingTop.replace("px", ""));

  // Calculate distance from first selected node to editor top
  const firstNodeToEditorDistance =
    firstDomNode.getBoundingClientRect().top -
    editable.getBoundingClientRect().top -
    editorPaddingTop;

  // Get margin top of first selected node
  const firstMarginTopString = window.getComputedStyle(firstDomNode).marginTop;
  const marginTop = Number(firstMarginTopString.replace("px", ""));

  // Calculate distance from current node to editor top
  const currentToEditorDistance =
    child.getBoundingClientRect().top - editable.getBoundingClientRect().top - editorPaddingTop;

  const currentMarginTopString = window.getComputedStyle(child).marginTop;
  const currentMarginTop = Number(currentMarginTopString.replace("px", ""));

  const previewElementsTopDistance =
    currentToEditorDistance - firstNodeToEditorDistance + marginTop - currentMarginTop;

  return previewElementsTopDistance;
};

const calcDragButtonTop = (editor: PlateEditor, element: TElement): number => {
  void editor;
  void element;
  return 0;
};
