"use client";

import * as React from "react";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CombineIcon,
  Columns3Icon,
  Rows3Icon,
  Trash2Icon,
  UngroupIcon,
} from "lucide-react";
import { getTableColumnCount, setTableColSize, setTableRowSize } from "@platejs/table";
import {
  TablePlugin,
  TableProvider,
  roundCellSizeToStep,
  useOverrideColSize,
  useOverrideRowSize,
  useTableCellElement,
  useTableColSizes,
  useTableElement,
  useTableMergeState,
  useTableSelectionDom,
  useTableValue,
} from "@platejs/table/react";
import { KEYS, type Path } from "platejs";
import type { PlateElementProps } from "platejs/react";
import {
  PlateElement,
  useEditorPlugin,
  useEditorSelector,
  useElementSelector,
  useFocusedLast,
  useReadOnly,
} from "platejs/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { Separator } from "@arclayer/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";

import { captureEditorSelection, runEditorTransformPreservingSelection } from "../transforms";

const TABLE_DEFAULT_COLUMN_WIDTH = 160;
const TABLE_MIN_COLUMN_WIDTH = 120;
const TABLE_MIN_ROW_HEIGHT = 48;

type TableResizeDirection = "bottom" | "right";

type TableResizeStartOptions = {
  colIndex: number;
  direction: TableResizeDirection;
  handleKey: string;
  rowIndex: number;
};

type TableResizeDragState = {
  colIndex: number;
  direction: TableResizeDirection;
  initialPosition: number;
  initialSize: number;
  rowTopOffset: number;
  rowIndex: number;
};

type TableResizeContextValue = {
  clearResizePreview: (handleKey: string) => void;
  setResizePreview: (
    event: React.MouseEvent<HTMLDivElement>,
    options: TableResizeStartOptions,
  ) => void;
  startResize: (event: React.MouseEvent<HTMLDivElement>, options: TableResizeStartOptions) => void;
};

const TableResizeContext = React.createContext<TableResizeContextValue | null>(null);

function useTableResizeContext() {
  const context = React.useContext(TableResizeContext);

  if (!context) {
    throw new Error("TableResizeContext is missing");
  }

  return context;
}

function roundSize(value: number, minValue: number) {
  return Math.max(minValue, roundCellSizeToStep(value, undefined));
}

function resolveMarginOffset(value: number | string | undefined) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;

  const nextValue = Number.parseFloat(value);
  return Number.isFinite(nextValue) ? nextValue : 0;
}

function captureScrollableAncestors(startNode: HTMLElement | null) {
  const ancestors: Array<{
    node: HTMLElement;
    scrollLeft: number;
    scrollTop: number;
  }> = [];
  let currentNode = startNode?.parentElement ?? null;

  while (currentNode) {
    const { overflowX, overflowY } = window.getComputedStyle(currentNode);
    const isScrollableX =
      /(auto|scroll|overlay)/.test(overflowX) && currentNode.scrollWidth > currentNode.clientWidth;
    const isScrollableY =
      /(auto|scroll|overlay)/.test(overflowY) &&
      currentNode.scrollHeight > currentNode.clientHeight;

    if (isScrollableX || isScrollableY) {
      ancestors.push({
        node: currentNode,
        scrollLeft: currentNode.scrollLeft,
        scrollTop: currentNode.scrollTop,
      });
    }

    currentNode = currentNode.parentElement;
  }

  return ancestors;
}

function restoreScrollableAncestors(
  ancestors: Array<{
    node: HTMLElement;
    scrollLeft: number;
    scrollTop: number;
  }>,
) {
  for (const ancestor of ancestors) {
    ancestor.node.scrollLeft = ancestor.scrollLeft;
    ancestor.node.scrollTop = ancestor.scrollTop;
  }
}

function TableToolbarButton(props: React.ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild focusTrigger={false}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={props.tooltip}
          className={cn(
            "size-8 rounded-md text-label-secondary hover:text-label-primary",
            props.className,
          )}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
  );
}

function TableElementToolbar() {
  const { t } = useTranslation("content");
  const { editor, tf } = useEditorPlugin(TablePlugin);
  const { canMerge, canSplit } = useTableMergeState();
  const selectionRef = React.useRef(captureEditorSelection(editor));

  const action = React.useCallback(
    (run: () => void) => {
      const tableEntry = editor.api.above({ match: { type: editor.getType(KEYS.table) } });
      const scrollAncestors = tableEntry
        ? captureScrollableAncestors(editor.api.toDOMNode(tableEntry[0]) ?? null)
        : [];

      runEditorTransformPreservingSelection(
        editor,
        () => {
          run();
        },
        {
          focus: false,
          restoreSelection: true,
          selection: selectionRef.current,
        },
      );

      window.requestAnimationFrame(() => {
        restoreScrollableAncestors(scrollAncestors);
        window.requestAnimationFrame(() => {
          restoreScrollableAncestors(scrollAncestors);
        });
      });
    },
    [editor],
  );

  return (
    <div className="flex items-center gap-1 rounded-md border border-border/70 bg-card/96 p-1 backdrop-blur">
      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_ROW_BEFORE")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.insert.tableRow({ before: true }))}
      >
        <ArrowUpIcon className="size-4" />
      </TableToolbarButton>
      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_ROW_AFTER")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.insert.tableRow())}
      >
        <ArrowDownIcon className="size-4" />
      </TableToolbarButton>
      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_COLUMN_BEFORE")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.insert.tableColumn({ before: true }))}
      >
        <ArrowLeftIcon className="size-4" />
      </TableToolbarButton>
      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_INSERT_COLUMN_AFTER")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.insert.tableColumn())}
      >
        <ArrowRightIcon className="size-4" />
      </TableToolbarButton>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <TableToolbarButton
        disabled={!canMerge}
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_MERGE_CELLS")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.table.merge())}
      >
        <CombineIcon className="size-4" />
      </TableToolbarButton>
      <TableToolbarButton
        disabled={!canSplit}
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_SPLIT_CELL")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.table.split())}
      >
        <UngroupIcon className="size-4" />
      </TableToolbarButton>

      <Separator orientation="vertical" className="mx-0.5 h-6" />

      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_DELETE_ROW")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.remove.tableRow())}
      >
        <Rows3Icon className="size-4" />
      </TableToolbarButton>
      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_DELETE_COLUMN")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.remove.tableColumn())}
      >
        <Columns3Icon className="size-4" />
      </TableToolbarButton>
      <TableToolbarButton
        tooltip={t("CONTENT_LIBRARY_EDITOR_TABLE_DELETE")}
        onMouseDown={(event) => {
          event.preventDefault();
          selectionRef.current = captureEditorSelection(editor);
        }}
        onClick={() => action(() => tf.remove.table())}
      >
        <Trash2Icon className="size-4" />
      </TableToolbarButton>
    </div>
  );
}

function useTableResizeController(params: {
  dragIndicatorRef: React.RefObject<HTMLDivElement | null>;
  hoverIndicatorRef: React.RefObject<HTMLDivElement | null>;
  marginLeftOffset: number;
  resolvedColSizes: number[];
  tablePath: Path;
  tableRef: React.RefObject<HTMLTableElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { editor } = useEditorPlugin(TablePlugin);
  const overrideColSize = useOverrideColSize();
  const overrideRowSize = useOverrideRowSize();
  const activeHandleKeyRef = React.useRef<string | null>(null);
  const cleanupListenersRef = React.useRef<(() => void) | null>(null);
  const dragStateRef = React.useRef<TableResizeDragState | null>(null);
  const previewHandleKeyRef = React.useRef<string | null>(null);
  const resolvedColSizesRef = React.useRef(params.resolvedColSizes);

  React.useEffect(() => {
    resolvedColSizesRef.current = params.resolvedColSizes;
  }, [params.resolvedColSizes]);

  const hideIndicator = React.useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    const indicator = ref.current;
    if (!indicator) return;

    indicator.style.display = "none";
    indicator.style.removeProperty("left");
    indicator.style.removeProperty("top");
    indicator.style.removeProperty("height");
    indicator.style.removeProperty("width");
  }, []);

  const hideDragIndicator = React.useCallback(() => {
    hideIndicator(params.dragIndicatorRef);
  }, [hideIndicator, params.dragIndicatorRef]);

  const hideHoverIndicator = React.useCallback(() => {
    hideIndicator(params.hoverIndicatorRef);
  }, [hideIndicator, params.hoverIndicatorRef]);

  const showVerticalIndicator = React.useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, offset: number) => {
      const indicator = ref.current;
      const wrapper = params.wrapperRef.current;
      if (!indicator || !wrapper) return;

      indicator.style.display = "block";
      indicator.style.left = `${params.marginLeftOffset + offset}px`;
      indicator.style.top = "0";
      indicator.style.height = `${wrapper.clientHeight}px`;
      indicator.style.width = "3px";
    },
    [params.marginLeftOffset, params.wrapperRef],
  );

  const showHorizontalIndicator = React.useCallback(
    (ref: React.RefObject<HTMLDivElement | null>, offset: number) => {
      const indicator = ref.current;
      const wrapper = params.wrapperRef.current;
      if (!indicator || !wrapper) return;

      indicator.style.display = "block";
      indicator.style.left = "0";
      indicator.style.top = `${offset}px`;
      indicator.style.width = `${wrapper.clientWidth}px`;
      indicator.style.height = "3px";
    },
    [params.wrapperRef],
  );

  const getColumnBoundaryOffset = React.useCallback((colIndex: number, width: number) => {
    return (
      resolvedColSizesRef.current.slice(0, colIndex).reduce((total, size) => total + size, 0) +
      width
    );
  }, []);

  const getRowBoundaryOffset = React.useCallback(
    (rowIndex: number) => {
      const wrapperRect = params.wrapperRef.current?.getBoundingClientRect();
      const rowRect = params.tableRef.current?.rows.item(rowIndex)?.getBoundingClientRect();
      if (!wrapperRect || !rowRect) return null;

      return rowRect.bottom - wrapperRect.top;
    },
    [params.tableRef, params.wrapperRef],
  );

  const setResizePreview = React.useCallback(
    (_event: React.MouseEvent<HTMLDivElement>, options: TableResizeStartOptions) => {
      if (activeHandleKeyRef.current) return;

      previewHandleKeyRef.current = options.handleKey;
      if (options.direction === "bottom") {
        const rowBoundaryOffset = getRowBoundaryOffset(options.rowIndex);
        if (rowBoundaryOffset == null) return;

        showHorizontalIndicator(params.hoverIndicatorRef, rowBoundaryOffset);
        return;
      }

      showVerticalIndicator(
        params.hoverIndicatorRef,
        getColumnBoundaryOffset(
          options.colIndex,
          resolvedColSizesRef.current[options.colIndex] ?? TABLE_DEFAULT_COLUMN_WIDTH,
        ),
      );
    },
    [
      getColumnBoundaryOffset,
      getRowBoundaryOffset,
      params.hoverIndicatorRef,
      showHorizontalIndicator,
      showVerticalIndicator,
    ],
  );

  const clearResizePreview = React.useCallback(
    (handleKey: string) => {
      if (activeHandleKeyRef.current) return;
      if (previewHandleKeyRef.current !== handleKey) return;

      previewHandleKeyRef.current = null;
      hideHoverIndicator();
    },
    [hideHoverIndicator],
  );

  const stopResize = React.useCallback(() => {
    cleanupListenersRef.current?.();
    cleanupListenersRef.current = null;
    activeHandleKeyRef.current = null;
    previewHandleKeyRef.current = null;
    dragStateRef.current = null;
    hideDragIndicator();
    hideHoverIndicator();
  }, [hideDragIndicator, hideHoverIndicator]);

  React.useEffect(() => stopResize, [stopResize]);

  const applyResize = React.useCallback(
    (pointerEvent: MouseEvent, finished: boolean) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      if (dragState.direction === "bottom") {
        const nextHeight = roundSize(
          dragState.initialSize + (pointerEvent.clientY - dragState.initialPosition),
          TABLE_MIN_ROW_HEIGHT,
        );

        if (finished) {
          setTableRowSize(
            editor,
            { height: nextHeight, rowIndex: dragState.rowIndex },
            { at: params.tablePath },
          );
          window.setTimeout(() => overrideRowSize(dragState.rowIndex, null), 0);
        } else {
          overrideRowSize(dragState.rowIndex, nextHeight);
          showHorizontalIndicator(params.dragIndicatorRef, dragState.rowTopOffset + nextHeight);
        }

        return;
      }

      const nextWidth = roundSize(
        dragState.initialSize + (pointerEvent.clientX - dragState.initialPosition),
        TABLE_MIN_COLUMN_WIDTH,
      );

      if (finished) {
        setTableColSize(
          editor,
          { colIndex: dragState.colIndex, width: nextWidth },
          {
            at: params.tablePath,
          },
        );
        window.setTimeout(() => overrideColSize(dragState.colIndex, null), 0);
      } else {
        overrideColSize(dragState.colIndex, nextWidth);
        showVerticalIndicator(
          params.dragIndicatorRef,
          getColumnBoundaryOffset(dragState.colIndex, nextWidth),
        );
      }
    },
    [
      editor,
      getColumnBoundaryOffset,
      overrideColSize,
      overrideRowSize,
      params.dragIndicatorRef,
      params.tablePath,
      showHorizontalIndicator,
      showVerticalIndicator,
    ],
  );

  const startResize = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>, options: TableResizeStartOptions) => {
      const wrapperRect = params.wrapperRef.current?.getBoundingClientRect();
      const rowRect = params.tableRef.current?.rows.item(options.rowIndex)?.getBoundingClientRect();
      if (!wrapperRect) return;

      dragStateRef.current = {
        colIndex: options.colIndex,
        direction: options.direction,
        initialPosition: options.direction === "bottom" ? event.clientY : event.clientX,
        initialSize:
          options.direction === "bottom"
            ? (rowRect?.height ?? TABLE_MIN_ROW_HEIGHT)
            : (resolvedColSizesRef.current[options.colIndex] ?? TABLE_DEFAULT_COLUMN_WIDTH),
        rowTopOffset: rowRect ? rowRect.top - wrapperRect.top : 0,
        rowIndex: options.rowIndex,
      };
      activeHandleKeyRef.current = options.handleKey;
      previewHandleKeyRef.current = null;

      cleanupListenersRef.current?.();

      const handleMouseMove = (mouseEvent: MouseEvent) => {
        applyResize(mouseEvent, false);
      };

      const handleMouseUp = (mouseEvent: MouseEvent) => {
        applyResize(mouseEvent, true);
        stopResize();
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      cleanupListenersRef.current = () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      if (options.direction === "bottom") {
        const rowBoundaryOffset = getRowBoundaryOffset(options.rowIndex);
        if (rowBoundaryOffset != null) {
          showHorizontalIndicator(params.dragIndicatorRef, rowBoundaryOffset);
        }
      } else {
        showVerticalIndicator(
          params.dragIndicatorRef,
          getColumnBoundaryOffset(
            options.colIndex,
            resolvedColSizesRef.current[options.colIndex] ?? TABLE_DEFAULT_COLUMN_WIDTH,
          ),
        );
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [
      applyResize,
      getColumnBoundaryOffset,
      getRowBoundaryOffset,
      params.dragIndicatorRef,
      params.tableRef,
      params.wrapperRef,
      showHorizontalIndicator,
      showVerticalIndicator,
      stopResize,
    ],
  );

  return React.useMemo(
    () => ({
      clearResizePreview,
      setResizePreview,
      startResize,
    }),
    [clearResizePreview, setResizePreview, startResize],
  );
}

function TableElementContent(props: PlateElementProps) {
  const tableRef = React.useRef<HTMLTableElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);
  const dragIndicatorRef = React.useRef<HTMLDivElement | null>(null);
  const hoverIndicatorRef = React.useRef<HTMLDivElement | null>(null);
  const readOnly = useReadOnly();
  const isFocusedLast = useFocusedLast();
  const colSizes = useTableColSizes();
  const { props: tableProps, marginLeft } = useTableElement();
  const tableId = (props.element as { id?: string }).id ?? null;
  const resolvedColSizes = React.useMemo(() => {
    if (colSizes.length > 0) {
      return colSizes.map((size) => size || TABLE_DEFAULT_COLUMN_WIDTH);
    }

    return Array.from(
      { length: getTableColumnCount(props.element as never) },
      () => TABLE_DEFAULT_COLUMN_WIDTH,
    );
  }, [colSizes, props.element]);
  const tableWidth = React.useMemo(
    () => resolvedColSizes.reduce((total, size) => total + size, 0),
    [resolvedColSizes],
  );
  const marginLeftOffset = React.useMemo(() => resolveMarginOffset(marginLeft), [marginLeft]);
  const selectedTableIds = useEditorSelector(
    (editor) => editor.getApi(TablePlugin).table.getSelectedTableIds?.() ?? [],
    [],
  );
  const selectionInCurrentTable = useEditorSelector(
    (editor) => {
      const tableEntry = editor.api.above({ match: { type: editor.getType(KEYS.table) } });
      if (!tableEntry || !tableId) return false;

      const [currentTable] = tableEntry;
      return (currentTable as { id?: string }).id === tableId;
    },
    [tableId],
  );
  const open =
    !readOnly &&
    isFocusedLast &&
    ((!!tableId && selectedTableIds.includes(tableId)) || selectionInCurrentTable);
  const resizeController = useTableResizeController({
    dragIndicatorRef,
    hoverIndicatorRef,
    marginLeftOffset,
    resolvedColSizes,
    tablePath: props.path,
    tableRef,
    wrapperRef,
  });

  useTableSelectionDom(tableRef);

  return (
    <Popover open={open} modal={false}>
      <PopoverAnchor asChild>
        <div className="group/table relative my-6 overflow-x-auto">
          <TableResizeContext.Provider value={resizeController}>
            <div ref={wrapperRef} className="relative w-fit">
              <div
                ref={dragIndicatorRef}
                className="pointer-events-none absolute z-40 hidden rounded-full bg-primary/70"
                contentEditable={false}
              />
              <div
                ref={hoverIndicatorRef}
                className="pointer-events-none absolute z-30 hidden rounded-full bg-primary/45"
                contentEditable={false}
              />

              <PlateElement
                {...props}
                {...tableProps}
                ref={tableRef}
                as="table"
                className={cn(
                  "table-fixed border-collapse overflow-hidden rounded-md border border-border/70 bg-card",
                  open && "ring-2 ring-primary/60 ring-offset-2 ring-offset-background",
                )}
                style={{
                  marginLeft,
                  width: `${tableWidth}px`,
                }}
              >
                {resolvedColSizes.length > 0 ? (
                  <colgroup>
                    {resolvedColSizes.map((size, index) => (
                      <col key={index} style={{ width: `${size}px` }} />
                    ))}
                  </colgroup>
                ) : null}
                <tbody>{props.children}</tbody>
              </PlateElement>
            </div>
          </TableResizeContext.Provider>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="center"
        side="bottom"
        className="w-auto border-0 bg-transparent p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <TableElementToolbar />
      </PopoverContent>
    </Popover>
  );
}

export function TableElement(props: PlateElementProps) {
  return (
    <TableProvider>
      <TableElementContent {...props} />
    </TableProvider>
  );
}

export function TableRowElement(props: PlateElementProps) {
  const rowIndex = useElementSelector(([, path]) => path.at(-1) as number, [], {
    key: KEYS.tr,
  });
  const rowSize = useElementSelector(([node]) => (node as { size?: number }).size, [], {
    key: KEYS.tr,
  });
  const rowSizeOverrides = useTableValue("rowSizeOverrides");
  const rowMinHeight = rowSizeOverrides.get?.(rowIndex) ?? rowSize;

  return (
    <PlateElement
      {...props}
      as="tr"
      className="border-b border-border/70 last:border-b-0"
      style={
        {
          ...props.style,
          "--tableRowMinHeight": rowMinHeight ? `${rowMinHeight}px` : undefined,
        } as React.CSSProperties
      }
    />
  );
}

function TableCellResizeHandles() {
  const readOnly = useReadOnly();
  const { clearResizePreview, setResizePreview, startResize } = useTableResizeContext();
  const { colIndex, rowIndex } = useTableCellElement();

  if (readOnly) return null;

  const rightHandleKey = `right:${rowIndex}:${colIndex}`;
  const bottomHandleKey = `bottom:${rowIndex}:${colIndex}`;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 select-none"
      contentEditable={false}
      suppressContentEditableWarning
    >
      <div
        className="pointer-events-auto absolute -right-1 top-0 z-30 h-full w-2 cursor-col-resize touch-none"
        onMouseEnter={(event) => {
          setResizePreview(event, {
            colIndex,
            direction: "right",
            handleKey: rightHandleKey,
            rowIndex,
          });
        }}
        onMouseLeave={() => {
          clearResizePreview(rightHandleKey);
        }}
        onMouseDown={(event) => {
          startResize(event, {
            colIndex,
            direction: "right",
            handleKey: rightHandleKey,
            rowIndex,
          });
        }}
      />
      <div
        className="pointer-events-auto absolute bottom-0 left-0 z-30 h-3 w-full translate-y-1/2 cursor-row-resize touch-none"
        onMouseEnter={(event) => {
          setResizePreview(event, {
            colIndex,
            direction: "bottom",
            handleKey: bottomHandleKey,
            rowIndex,
          });
        }}
        onMouseLeave={() => {
          clearResizePreview(bottomHandleKey);
        }}
        onMouseDown={(event) => {
          startResize(event, {
            colIndex,
            direction: "bottom",
            handleKey: bottomHandleKey,
            rowIndex,
          });
        }}
      />
    </div>
  );
}

function TableCellBase(
  props: PlateElementProps & {
    as: "td" | "th";
    className: string;
  },
) {
  const cellState = useTableCellElement() as {
    minHeight?: number | string;
    rowSpan?: number;
    selected?: boolean;
  };

  return (
    <PlateElement
      {...props}
      as={props.as}
      className={cn(
        "relative min-w-[8rem] border-r border-border/70 align-top last:border-r-0",
        cellState.selected && "bg-primary/6",
        props.className,
      )}
      style={{ minHeight: cellState.minHeight }}
    >
      <div
        className="px-4 py-3"
        style={
          cellState.rowSpan && cellState.rowSpan > 1
            ? undefined
            : { minHeight: "var(--tableRowMinHeight, 0px)" }
        }
      >
        {props.children}
      </div>
      <TableCellResizeHandles />
    </PlateElement>
  );
}

export function TableCellElement(props: PlateElementProps) {
  return <TableCellBase {...props} as="td" className="bg-card" />;
}

export function TableHeaderCellElement(props: PlateElementProps) {
  return (
    <TableCellBase
      {...props}
      as="th"
      className="bg-muted/35 text-left font-semibold text-label-primary"
    />
  );
}
