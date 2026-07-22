import { useEffect, useMemo, useState } from "react";
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

const DASHBOARD_LAYOUT_VERSION = 2;
const ALLOWED_SPANS = [3, 4, 6, 8, 9, 12] as const;
const BREAKPOINTS = { lg: 1200, md: 768, sm: 480, xs: 0 } as const;
const BREAKPOINT_COLUMNS = { lg: 12, md: 8, sm: 4, xs: 1 } as const;
const GRID_ROW_HEIGHT = 8;
const GRID_MARGIN = [16, 8] as const;
const MIN_WIDGET_HEIGHT = 128;
const MAX_WIDGET_HEIGHT = 960;

type DashboardSpan = (typeof ALLOWED_SPANS)[number];
type DashboardBreakpoint = keyof typeof BREAKPOINTS;

export type DashboardWidget = Readonly<{
  id: string;
  title: string;
  content: React.ReactNode;
  defaultSpan?: DashboardSpan;
  defaultHeight?: number;
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
  const boundedHeight = Math.min(MAX_WIDGET_HEIGHT, Math.max(MIN_WIDGET_HEIGHT, height));
  return Math.max(1, Math.round((boundedHeight + GRID_MARGIN[1]) / 16));
}

function rowsToHeight(rows: number) {
  return rows * GRID_ROW_HEIGHT + Math.max(0, rows - 1) * GRID_MARGIN[1];
}

function widthForColumns(span: DashboardSpan, columns: number) {
  if (columns === 1) return 1;
  return Math.max(1, Math.min(columns, Math.round((span / 12) * columns)));
}

function createBreakpointLayout(widgets: readonly DashboardWidget[], columns: number): Layout {
  let x = 0;
  let y = 0;
  let currentRowHeight = 0;

  return widgets.map((widget) => {
    const width = widthForColumns(widget.defaultSpan ?? 3, columns);
    const height = heightToRows(widget.defaultHeight ?? 144);
    if (x + width > columns) {
      x = 0;
      y += currentRowHeight;
      currentRowHeight = 0;
    }
    const item: LayoutItem = {
      i: widget.id,
      x,
      y,
      w: width,
      h: height,
      minW: 1,
      minH: heightToRows(MIN_WIDGET_HEIGHT),
      maxW: columns,
      maxH: heightToRows(MAX_WIDGET_HEIGHT),
    };
    x += width;
    currentRowHeight = Math.max(currentRowHeight, height);
    return item;
  });
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

function reconcileLayout(layout: Layout | undefined, fallback: Layout, widgetIds: Set<string>) {
  const currentById = new Map(
    (layout ?? []).filter((item) => widgetIds.has(item.i)).map((item) => [item.i, item]),
  );
  return fallback.map((item) => currentById.get(item.i) ?? item);
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

function DashboardWidgetItem(props: {
  widget: DashboardWidget;
  activeLayout?: LayoutItem;
  resizePreview: ResizePreview | null;
  isEditing: boolean;
  onWidthChange: (id: string, span: DashboardSpan) => void;
  onHide: (id: string) => void;
  onKeyboardMove: (id: string, xDelta: number, yDelta: number) => void;
}) {
  const { t } = useTranslation("platform");
  const preview = props.resizePreview?.id === props.widget.id ? props.resizePreview : null;

  return (
    <div
      key={props.widget.id}
      className="group/widget min-h-0 min-w-0 overflow-hidden"
      data-dashboard-widget={props.widget.id}
    >
      <div className="h-full min-h-0 min-w-0 overflow-hidden [&>*]:h-full [&>*]:min-h-0 [&>*]:min-w-0">
        {props.widget.content}
      </div>
      {preview ? (
        <div className="pointer-events-none absolute bottom-2 left-2 z-30 rounded-md border bg-background/95 px-2 py-1 font-mono text-xs tabular-nums text-label-secondary shadow-sm">
          {preview.width} × {rowsToHeight(preview.height)} px
        </div>
      ) : null}
      {props.isEditing ? (
        <div className="absolute right-2 top-2 z-30 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur-sm transition-opacity duration-100 group-hover/widget:opacity-100 focus-within:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="dashboard-drag-handle cursor-grab active:cursor-grabbing"
            aria-label={t("DASHBOARD_DRAG_WIDGET", { title: props.widget.title })}
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
              props.onKeyboardMove(props.widget.id, delta[0], delta[1]);
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
                aria-label={t("DASHBOARD_RESIZE_WIDGET", { title: props.widget.title })}
              >
                <Maximize2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t("DASHBOARD_WIDGET_WIDTH")}</DropdownMenuLabel>
              {ALLOWED_SPANS.map((span) => (
                <DropdownMenuCheckboxItem
                  key={span}
                  checked={
                    props.activeLayout?.w === widthForColumns(span, props.activeLayout?.maxW ?? 12)
                  }
                  onCheckedChange={() => props.onWidthChange(props.widget.id, span)}
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
            aria-label={t("DASHBOARD_HIDE_WIDGET", { title: props.widget.title })}
            onClick={() => props.onHide(props.widget.id)}
          >
            <EyeOff />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ConfigurableDashboard(props: {
  dashboardId: string;
  widgets: readonly DashboardWidget[];
  ariaLabel: string;
  className?: string;
}) {
  const { t } = useTranslation("platform");
  const storageKey = `arclayer:dashboard-layout:v${DASHBOARD_LAYOUT_VERSION}:${props.dashboardId}`;
  const { width, containerRef, mounted } = useContainerWidth();
  const [isEditing, setIsEditing] = useState(false);
  const [activeBreakpoint, setActiveBreakpoint] = useState<DashboardBreakpoint>("lg");
  const [resizePreview, setResizePreview] = useState<ResizePreview | null>(null);
  const [state, setState] = useState<DashboardLayoutState>(() =>
    readState(storageKey, props.widgets),
  );
  const hiddenWidgetIds = useMemo(() => new Set(state.hiddenWidgetIds), [state.hiddenWidgetIds]);
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
          (state.layouts[breakpoint] ?? []).filter((item) => visibleWidgetIds.has(item.i)),
        ]),
      ) as ResponsiveLayouts<DashboardBreakpoint>,
    [state.layouts, visibleWidgetIds],
  );
  const activeLayoutById = useMemo(
    () => new Map((state.layouts[activeBreakpoint] ?? []).map((item) => [item.i, item])),
    [activeBreakpoint, state.layouts],
  );

  useEffect(() => {
    setState((current) => {
      const next = reconcileState(current, props.widgets);
      return sameState(current, next) ? current : next;
    });
  }, [props.widgets]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ version: DASHBOARD_LAYOUT_VERSION, ...state }),
      );
    } catch (error) {
      console.error("Failed to persist dashboard layout preferences.", error);
    }
  }, [state, storageKey]);

  const updateActiveLayout = (id: string, update: (item: LayoutItem) => LayoutItem) => {
    setState((current) => ({
      ...current,
      layouts: {
        ...current.layouts,
        [activeBreakpoint]: (current.layouts[activeBreakpoint] ?? []).map((item) =>
          item.i === id ? update(item) : item,
        ),
      },
    }));
  };

  return (
    <section className={cn("min-w-0 space-y-3", props.className)} aria-label={props.ariaLabel}>
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
      <p className="sr-only" aria-live="polite">
        {t(isEditing ? "DASHBOARD_EDIT_MODE_ACTIVE" : "DASHBOARD_EDIT_MODE_INACTIVE")}
      </p>
      <div ref={containerRef} className="min-w-0 overflow-hidden">
        {mounted ? (
          <Responsive<DashboardBreakpoint>
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
            onLayoutChange={(_layout, nextLayouts) =>
              setState((current) => {
                const next = {
                  ...current,
                  layouts: mergeVisibleLayouts(current.layouts, nextLayouts, visibleWidgetIds),
                };
                return sameState(current, next) ? current : next;
              })
            }
            onResize={(_layout, _oldItem, newItem) =>
              setResizePreview(
                newItem ? { id: newItem.i, width: newItem.w, height: newItem.h } : null,
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
                      w: widthForColumns(span, BREAKPOINT_COLUMNS[activeBreakpoint]),
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
