import { forwardRef, useEffect, useMemo, useState, type HTMLAttributes } from "react";
import {
  Check,
  EyeOff,
  GripVertical,
  Maximize2,
  PencilRuler,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import {
  Responsive,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
  useContainerWidth,
  verticalCompactor,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

const DASHBOARD_LAYOUT_VERSION = 5;
const ALLOWED_SPANS = [3, 4, 6, 8, 9, 12] as const;
const BREAKPOINTS = { lg: 1024, md: 720, sm: 480, xs: 0 } as const;
const BREAKPOINT_COLUMNS = { lg: 12, md: 8, sm: 4, xs: 1 } as const;
const GRID_ROW_HEIGHT = 8;
const GRID_MARGIN = [16, 8] as const;
const MIN_WIDGET_HEIGHT = 128;

type DashboardSpan = (typeof ALLOWED_SPANS)[number];
type DashboardBreakpoint = keyof typeof BREAKPOINTS;

export type DashboardWidget = Readonly<{
  id: string;
  title: string;
  content: React.ReactNode;
  defaultSpan?: DashboardSpan;
  minSpan?: DashboardSpan;
  defaultHeight?: number;
  minHeight?: number;
  transient?: boolean;
}>;

type DashboardLayoutState = Readonly<{
  layouts: ResponsiveLayouts<DashboardBreakpoint>;
  hiddenWidgetIds: readonly string[];
}>;

type StoredDashboardLayout = DashboardLayoutState & Readonly<{ version: number }>;

type ResizePreview = Readonly<{
  id: string;
  width: number;
  height: number;
}>;

function heightToRows(height: number) {
  const boundedHeight = Math.max(MIN_WIDGET_HEIGHT, height);
  return Math.max(
    1,
    Math.ceil((boundedHeight + GRID_MARGIN[1]) / (GRID_ROW_HEIGHT + GRID_MARGIN[1])),
  );
}

function rowsToHeight(rows: number) {
  return rows * GRID_ROW_HEIGHT + Math.max(0, rows - 1) * GRID_MARGIN[1];
}

function widthForColumns(span: DashboardSpan, columns: number) {
  if (columns === 1) return 1;
  return Math.max(1, Math.min(columns, Math.floor((span / 12) * columns)));
}

function defaultWidthForColumns(span: DashboardSpan, columns: number) {
  if (columns <= 1) return 1;
  if (columns <= 4) return columns;
  if (columns <= 8) return span >= 8 ? columns : Math.ceil(columns / 2);
  return Math.min(span, columns);
}

function columnsToWidth(width: number, columns: number, containerWidth: number) {
  const availableWidth = containerWidth - Math.max(0, columns - 1) * GRID_MARGIN[0];
  const columnWidth = availableWidth / columns;
  return Math.round(width * columnWidth + Math.max(0, width - 1) * GRID_MARGIN[0]);
}

function createBreakpointLayout(widgets: readonly DashboardWidget[], columns: number): Layout {
  const layout: LayoutItem[] = [];
  let row: Array<{ widget: DashboardWidget; width: number; height: number }> = [];
  let rowWidth = 0;
  let y = 0;
  let rowHeight = 0;

  const flushRow = () => {
    if (row.length === 0) return;
    const distributableSpace = columns - rowWidth;
    const gap = row.length > 1 ? distributableSpace / (row.length - 1) : 0;
    let x = 0;
    for (const [index, entry] of row.entries()) {
      layout.push({
        i: entry.widget.id,
        x: Math.round(x),
        y,
        w: entry.width,
        h: entry.height,
        minW: defaultWidthForColumns(entry.widget.minSpan ?? 3, columns),
        minH: heightToRows(entry.widget.minHeight ?? MIN_WIDGET_HEIGHT),
        maxW: columns,
      });
      x += entry.width + (index < row.length - 1 ? gap : 0);
    }
    y += rowHeight;
    row = [];
    rowWidth = 0;
    rowHeight = 0;
  };

  for (const widget of widgets) {
    const minimumWidth = defaultWidthForColumns(widget.minSpan ?? 3, columns);
    const width = Math.max(minimumWidth, defaultWidthForColumns(widget.defaultSpan ?? 3, columns));
    const height = Math.max(
      heightToRows(widget.minHeight ?? MIN_WIDGET_HEIGHT),
      heightToRows(widget.defaultHeight ?? 144),
    );
    if (row.length > 0 && (rowWidth + width > columns || height !== rowHeight)) flushRow();
    row.push({ widget, width, height });
    rowWidth += width;
    rowHeight = height;
  }
  flushRow();
  return layout;
}

function createDefaultState(widgets: readonly DashboardWidget[]): DashboardLayoutState {
  return {
    layouts: Object.fromEntries(
      Object.entries(BREAKPOINT_COLUMNS).map(([breakpoint, columns]) => [
        breakpoint,
        createBreakpointLayout(widgets, columns),
      ]),
    ) as ResponsiveLayouts<DashboardBreakpoint>,
    hiddenWidgetIds: [],
  };
}

function isLayoutItem(value: unknown): value is LayoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LayoutItem>;
  return (
    typeof item.i === "string" &&
    [item.x, item.y, item.w, item.h].every(
      (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
    )
  );
}

function isStoredLayout(value: unknown): value is StoredDashboardLayout {
  if (!value || typeof value !== "object") return false;
  const stored = value as Partial<StoredDashboardLayout>;
  if (
    stored.version !== DASHBOARD_LAYOUT_VERSION ||
    !stored.layouts ||
    typeof stored.layouts !== "object" ||
    !Array.isArray(stored.hiddenWidgetIds)
  ) {
    return false;
  }
  return Object.values(stored.layouts).every(
    (layout) => Array.isArray(layout) && layout.every(isLayoutItem),
  );
}

function isCompatibleLayoutItem(item: LayoutItem, fallback: LayoutItem) {
  const minWidth = fallback.minW ?? 1;
  const minHeight = fallback.minH ?? 1;
  const maxWidth = fallback.maxW ?? Number.POSITIVE_INFINITY;
  const maxHeight = fallback.maxH ?? Number.POSITIVE_INFINITY;
  return (
    item.x >= 0 &&
    item.y >= 0 &&
    item.w >= minWidth &&
    item.w <= maxWidth &&
    item.h >= minHeight &&
    item.h <= maxHeight &&
    item.x + item.w <= maxWidth
  );
}

function reconcileLayout(layout: Layout | undefined, fallback: Layout, widgetIds: Set<string>) {
  const currentById = new Map(
    (layout ?? []).filter((item) => widgetIds.has(item.i)).map((item) => [item.i, item]),
  );
  return fallback.map((item) => {
    const current = currentById.get(item.i);
    if (!current || !isCompatibleLayoutItem(current, item)) return item;
    return {
      ...current,
      minW: item.minW,
      minH: item.minH,
      maxW: item.maxW,
      maxH: item.maxH,
    };
  });
}

function reconcileState(
  state: DashboardLayoutState,
  widgets: readonly DashboardWidget[],
): DashboardLayoutState {
  const defaults = createDefaultState(widgets);
  const widgetIds = new Set(widgets.map((widget) => widget.id));
  return {
    layouts: Object.fromEntries(
      (Object.keys(BREAKPOINTS) as DashboardBreakpoint[]).map((breakpoint) => [
        breakpoint,
        reconcileLayout(state.layouts[breakpoint], defaults.layouts[breakpoint] ?? [], widgetIds),
      ]),
    ) as ResponsiveLayouts<DashboardBreakpoint>,
    hiddenWidgetIds: state.hiddenWidgetIds.filter((id) => widgetIds.has(id)),
  };
}

function readState(storageKey: string, widgets: readonly DashboardWidget[]) {
  const defaults = createDefaultState(widgets);
  if (typeof window === "undefined") return defaults;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return defaults;
  try {
    const stored: unknown = JSON.parse(raw);
    if (!isStoredLayout(stored)) {
      throw new Error("Unsupported dashboard layout schema");
    }
    return reconcileState(stored, widgets);
  } catch (error) {
    console.error("Failed to read dashboard layout preferences.", error);
    return defaults;
  }
}

function sameState(left: DashboardLayoutState, right: DashboardLayoutState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeVisibleLayouts(
  current: ResponsiveLayouts<DashboardBreakpoint>,
  next: ResponsiveLayouts<DashboardBreakpoint>,
  visibleWidgetIds: Set<string>,
) {
  return Object.fromEntries(
    (Object.keys(BREAKPOINTS) as DashboardBreakpoint[]).map((breakpoint) => {
      const nextById = new Map((next[breakpoint] ?? []).map((item) => [item.i, item]));
      const merged = (current[breakpoint] ?? []).map((item) =>
        visibleWidgetIds.has(item.i) ? (nextById.get(item.i) ?? item) : item,
      );
      return [breakpoint, merged];
    }),
  ) as ResponsiveLayouts<DashboardBreakpoint>;
}

type DashboardWidgetItemProps = HTMLAttributes<HTMLDivElement> & {
  widget: DashboardWidget;
  activeLayout?: LayoutItem;
  resizePreview: ResizePreview | null;
  isEditing: boolean;
  onWidthChange: (id: string, span: DashboardSpan) => void;
  onHide: (id: string) => void;
  onKeyboardMove: (id: string, xDelta: number, yDelta: number) => void;
};

const DashboardWidgetItem = forwardRef<HTMLDivElement, DashboardWidgetItemProps>(
  function DashboardWidgetItem(
    {
      widget,
      activeLayout,
      resizePreview,
      isEditing,
      onWidthChange,
      onHide,
      onKeyboardMove,
      className,
      children: injectedChildren,
      ...rootProps
    },
    ref,
  ) {
    const { t } = useTranslation("platform");
    const preview = resizePreview?.id === widget.id ? resizePreview : null;

    return (
      <div
        {...rootProps}
        ref={ref}
        className={cn("group/widget min-h-0 min-w-0 overflow-hidden", className)}
        data-dashboard-widget={widget.id}
      >
        <div className="h-full min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:min-h-0 [&>*]:min-w-0">
          {widget.content}
        </div>
        {preview ? (
          <div className="pointer-events-none absolute bottom-2 left-2 z-30 rounded-md border bg-background/95 px-2 py-1 font-mono text-xs tabular-nums text-label-secondary shadow-sm">
            {preview.width} × {rowsToHeight(preview.height)} px
          </div>
        ) : null}
        {isEditing ? (
          <div className="absolute right-2 top-2 z-30 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-100 group-hover/widget:opacity-100 focus-within:opacity-100">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="dashboard-drag-handle cursor-grab active:cursor-grabbing"
              aria-label={t("DASHBOARD_DRAG_WIDGET", { title: widget.title })}
              onKeyDown={(event) => {
                const deltaByKey: Partial<Record<string, readonly [number, number]>> = {
                  ArrowLeft: [-1, 0],
                  ArrowRight: [1, 0],
                  ArrowUp: [0, -1],
                  ArrowDown: [0, 1],
                };
                const delta = deltaByKey[event.key];
                if (!delta) return;
                event.preventDefault();
                onKeyboardMove(widget.id, delta[0], delta[1]);
              }}
            >
              <GripVertical />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("DASHBOARD_RESIZE_WIDGET", { title: widget.title })}
                >
                  <Maximize2 />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t("DASHBOARD_WIDGET_WIDTH")}</DropdownMenuLabel>
                {ALLOWED_SPANS.map((span) => (
                  <DropdownMenuCheckboxItem
                    key={span}
                    checked={activeLayout?.w === widthForColumns(span, activeLayout?.maxW ?? 12)}
                    onCheckedChange={() => onWidthChange(widget.id, span)}
                  >
                    {t(`DASHBOARD_WIDTH_${span}`)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("DASHBOARD_HIDE_WIDGET", { title: widget.title })}
              onClick={() => onHide(widget.id)}
            >
              <EyeOff />
            </Button>
          </div>
        ) : null}
        {injectedChildren}
      </div>
    );
  },
);

export function ConfigurableDashboard(props: {
  dashboardId: string;
  widgets: readonly DashboardWidget[];
  ariaLabel: string;
  className?: string;
}) {
  const { t } = useTranslation("platform");
  const storageKey = `arclayer:dashboard-layout:v${DASHBOARD_LAYOUT_VERSION}:${props.dashboardId}`;
  const { width, containerRef, mounted } = useContainerWidth();
  const widgetSignature = useMemo(
    () =>
      props.widgets
        .map((widget) => `${widget.id}:${widget.transient ? "transient" : "stable"}`)
        .join("|"),
    [props.widgets],
  );
  const hasTransientWidgets = props.widgets.some((widget) => widget.transient);
  const [isEditing, setIsEditing] = useState(false);
  const [activeBreakpoint, setActiveBreakpoint] = useState<DashboardBreakpoint>("lg");
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const [state, setState] = useState<DashboardLayoutState>(() =>
    readState(storageKey, props.widgets),
  );
  const [hydratedWidgetSignature, setHydratedWidgetSignature] = useState<string | null>(() =>
    hasTransientWidgets ? null : widgetSignature,
  );
  const layoutReady = hasTransientWidgets || hydratedWidgetSignature === widgetSignature;
  const reconciledState = useMemo(
    () => reconcileState(state, props.widgets),
    [props.widgets, state],
  );
  const hiddenWidgetIds = useMemo(
    () => new Set(reconciledState.hiddenWidgetIds),
    [reconciledState.hiddenWidgetIds],
  );
  const visibleWidgetIds = useMemo(
    () =>
      new Set(
        props.widgets
          .filter((widget) => !hiddenWidgetIds.has(widget.id))
          .map((widget) => widget.id),
      ),
    [hiddenWidgetIds, props.widgets],
  );
  const visibleLayouts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(BREAKPOINTS) as DashboardBreakpoint[]).map((breakpoint) => [
          breakpoint,
          (reconciledState.layouts[breakpoint] ?? []).filter((item) =>
            visibleWidgetIds.has(item.i),
          ),
        ]),
      ) as ResponsiveLayouts<DashboardBreakpoint>,
    [reconciledState.layouts, visibleWidgetIds],
  );
  const activeLayoutById = useMemo(
    () => new Map((reconciledState.layouts[activeBreakpoint] ?? []).map((item) => [item.i, item])),
    [activeBreakpoint, reconciledState.layouts],
  );

  useEffect(() => {
    if (hasTransientWidgets) {
      setIsEditing(false);
      setHydratedWidgetSignature(null);
      return;
    }
    if (hydratedWidgetSignature === widgetSignature) return;
    setState(readState(storageKey, props.widgets));
    setHydratedWidgetSignature(widgetSignature);
  }, [hasTransientWidgets, hydratedWidgetSignature, props.widgets, storageKey, widgetSignature]);

  useEffect(() => {
    if (hasTransientWidgets || hydratedWidgetSignature !== widgetSignature) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ version: DASHBOARD_LAYOUT_VERSION, ...reconciledState }),
      );
    } catch (error) {
      console.error("Failed to persist dashboard layout preferences.", error);
    }
  }, [hasTransientWidgets, hydratedWidgetSignature, reconciledState, storageKey, widgetSignature]);

  const updateActiveLayout = (id: string, update: (item: LayoutItem) => LayoutItem) => {
    setState((current) => {
      const reconciled = reconcileState(current, props.widgets);
      return {
        ...reconciled,
        layouts: {
          ...reconciled.layouts,
          [activeBreakpoint]: (reconciled.layouts[activeBreakpoint] ?? []).map((item) =>
            item.i === id ? update(item) : item,
          ),
        },
      };
    });
  };

  return (
    <section className={cn("min-w-0 space-y-3", props.className)} aria-label={props.ariaLabel}>
      {!hasTransientWidgets ? (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant={isEditing ? "secondary" : "outline"}
            size="sm"
            aria-pressed={isEditing}
            onClick={() => {
              setIsEditing((current) => !current);
              setResizePreview(null);
            }}
          >
            {isEditing ? (
              <Check data-icon="inline-start" />
            ) : (
              <PencilRuler data-icon="inline-start" />
            )}
            {t(isEditing ? "DASHBOARD_FINISH_EDITING" : "DASHBOARD_EDIT_LAYOUT")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal data-icon="inline-start" />
                {t("DASHBOARD_CUSTOMIZE")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-64">
              <DropdownMenuLabel>{t("DASHBOARD_VISIBLE_WIDGETS")}</DropdownMenuLabel>
              {props.widgets.map((widget) => (
                <DropdownMenuCheckboxItem
                  key={widget.id}
                  checked={!hiddenWidgetIds.has(widget.id)}
                  onCheckedChange={(visible) =>
                    setState((current) => ({
                      ...current,
                      hiddenWidgetIds: visible
                        ? current.hiddenWidgetIds.filter((id) => id !== widget.id)
                        : [...current.hiddenWidgetIds, widget.id],
                    }))
                  }
                >
                  {widget.title}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<RotateCcw />}
                onSelect={() => setState(createDefaultState(props.widgets))}
              >
                {t("DASHBOARD_RESET_LAYOUT")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {t(isEditing ? "DASHBOARD_EDIT_MODE_ACTIVE" : "DASHBOARD_EDIT_MODE_INACTIVE")}
      </p>
      <div ref={containerRef} className="min-w-0 overflow-hidden">
        {mounted && layoutReady ? (
          <Responsive<DashboardBreakpoint>
            key={widgetSignature}
            width={width}
            layouts={visibleLayouts}
            breakpoints={BREAKPOINTS}
            cols={BREAKPOINT_COLUMNS}
            rowHeight={GRID_ROW_HEIGHT}
            margin={GRID_MARGIN}
            containerPadding={null}
            compactor={verticalCompactor}
            dragConfig={{
              enabled: isEditing,
              bounded: true,
              handle: ".dashboard-drag-handle",
              cancel: "button:not(.dashboard-drag-handle),[role='menuitem']",
            }}
            resizeConfig={{ enabled: isEditing, handles: ["se"] }}
            onBreakpointChange={(breakpoint) => setActiveBreakpoint(breakpoint)}
            onLayoutChange={(_layout, nextLayouts) => {
              if (hasTransientWidgets || hydratedWidgetSignature !== widgetSignature) return;
              setState((current) => {
                const reconciled = reconcileState(current, props.widgets);
                const next = {
                  ...reconciled,
                  layouts: mergeVisibleLayouts(reconciled.layouts, nextLayouts, visibleWidgetIds),
                };
                return sameState(current, next) ? current : next;
              });
            }}
            onResize={(_layout, _oldItem, newItem) =>
              setResizePreview(
                newItem
                  ? {
                      id: newItem.i,
                      width: columnsToWidth(newItem.w, BREAKPOINT_COLUMNS[activeBreakpoint], width),
                      height: newItem.h,
                    }
                  : null,
              )
            }
            onResizeStop={() => setResizePreview(null)}
            className="dashboard-responsive-grid min-w-0"
          >
            {props.widgets
              .filter((widget) => visibleWidgetIds.has(widget.id))
              .map((widget) => (
                <DashboardWidgetItem
                  key={widget.id}
                  widget={widget}
                  activeLayout={activeLayoutById.get(widget.id)}
                  resizePreview={resizePreview}
                  isEditing={isEditing}
                  onWidthChange={(id, span) =>
                    updateActiveLayout(id, (item) => ({
                      ...item,
                      w: Math.max(
                        item.minW ?? 1,
                        widthForColumns(span, BREAKPOINT_COLUMNS[activeBreakpoint]),
                      ),
                    }))
                  }
                  onHide={(id) =>
                    setState((current) => ({
                      ...current,
                      hiddenWidgetIds: [...current.hiddenWidgetIds, id],
                    }))
                  }
                  onKeyboardMove={(id, xDelta, yDelta) =>
                    updateActiveLayout(id, (item) => ({
                      ...item,
                      x: Math.max(
                        0,
                        Math.min(BREAKPOINT_COLUMNS[activeBreakpoint] - item.w, item.x + xDelta),
                      ),
                      y: Math.max(0, item.y + yDelta),
                    }))
                  }
                />
              ))}
          </Responsive>
        ) : null}
      </div>
    </section>
  );
}
