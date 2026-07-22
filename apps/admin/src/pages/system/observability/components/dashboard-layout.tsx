import { useEffect, useMemo, useRef, useState } from "react";
import { EyeOff, GripVertical, Maximize2, RotateCcw, SlidersHorizontal } from "lucide-react";
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
import { Sortable, SortableItem, SortableItemHandle } from "@arclayer/ui/sortable";

const DASHBOARD_LAYOUT_VERSION = 1;
const ALLOWED_SPANS = [3, 4, 6, 8, 9, 12] as const;
const MIN_WIDGET_HEIGHT = 128;
const MAX_WIDGET_HEIGHT = 960;

type DashboardSpan = (typeof ALLOWED_SPANS)[number];

export type DashboardWidget = Readonly<{
  id: string;
  title: string;
  content: React.ReactNode;
  defaultSpan?: DashboardSpan;
  defaultHeight?: number;
}>;

type DashboardLayoutItem = {
  id: string;
  span: DashboardSpan;
  height: number;
  visible: boolean;
};

type StoredDashboardLayout = {
  version: number;
  items: DashboardLayoutItem[];
};

type ResizeSnapshot = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  span: DashboardSpan;
  height: number;
};

const SPAN_CLASS: Record<DashboardSpan, string> = {
  3: "col-span-1 md:col-span-6 xl:col-span-3",
  4: "col-span-1 md:col-span-6 xl:col-span-4",
  6: "col-span-1 md:col-span-6",
  8: "col-span-1 md:col-span-12 xl:col-span-8",
  9: "col-span-1 md:col-span-12 xl:col-span-9",
  12: "col-span-1 md:col-span-12",
};

function clampHeight(value: number) {
  return Math.min(MAX_WIDGET_HEIGHT, Math.max(MIN_WIDGET_HEIGHT, Math.round(value / 16) * 16));
}

function closestSpan(value: number): DashboardSpan {
  return ALLOWED_SPANS.reduce((closest, span) =>
    Math.abs(span - value) < Math.abs(closest - value) ? span : closest,
  );
}

function defaultLayout(widgets: readonly DashboardWidget[]): DashboardLayoutItem[] {
  return widgets.map((widget) => ({
    id: widget.id,
    span: widget.defaultSpan ?? 3,
    height: clampHeight(widget.defaultHeight ?? 144),
    visible: true,
  }));
}

function isLayoutItem(value: unknown): value is DashboardLayoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DashboardLayoutItem>;
  return (
    typeof item.id === "string" &&
    ALLOWED_SPANS.includes(item.span as DashboardSpan) &&
    typeof item.height === "number" &&
    Number.isFinite(item.height) &&
    typeof item.visible === "boolean"
  );
}

function readLayout(storageKey: string, widgets: readonly DashboardWidget[]) {
  const defaults = defaultLayout(widgets);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Partial<StoredDashboardLayout>;
    if (stored.version !== DASHBOARD_LAYOUT_VERSION || !Array.isArray(stored.items)) {
      throw new Error("unsupported dashboard layout version");
    }
    const validItems = stored.items.filter(isLayoutItem);
    const widgetById = new Map(widgets.map((widget) => [widget.id, widget]));
    const storedById = new Map(validItems.map((item) => [item.id, item]));
    const orderedIds = [
      ...validItems.map((item) => item.id).filter((id) => widgetById.has(id)),
      ...widgets.map((widget) => widget.id).filter((id) => !storedById.has(id)),
    ];
    return orderedIds.map((id) => {
      const fallback = defaults.find((item) => item.id === id);
      const item = storedById.get(id);
      if (!fallback || !item) return fallback ?? defaults[0];
      return { ...item, height: clampHeight(item.height) };
    });
  } catch (error) {
    console.error("Failed to read dashboard layout preferences.", error);
    return defaults;
  }
}

function DashboardWidgetItem(props: {
  widget: DashboardWidget;
  layout: DashboardLayoutItem;
  onChange: (id: string, update: Partial<DashboardLayoutItem>) => void;
}) {
  const { t } = useTranslation("platform");
  const resizeRef = useRef<ResizeSnapshot | null>(null);

  return (
    <SortableItem
      value={props.widget.id}
      className={cn("group/widget relative min-w-0", SPAN_CLASS[props.layout.span])}
      data-dashboard-widget={props.widget.id}
    >
      <div className="h-full min-h-0 [&>*]:h-full" style={{ height: props.layout.height }}>
        {props.widget.content}
      </div>
      <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover/widget:opacity-100 focus-within:opacity-100">
        <SortableItemHandle asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("DASHBOARD_DRAG_WIDGET", { title: props.widget.title })}
          >
            <GripVertical />
          </Button>
        </SortableItemHandle>
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
                checked={props.layout.span === span}
                onCheckedChange={() => props.onChange(props.widget.id, { span })}
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
          onClick={() => props.onChange(props.widget.id, { visible: false })}
        >
          <EyeOff />
        </Button>
      </div>
      <button
        type="button"
        className="absolute bottom-1 right-1 z-20 size-5 cursor-nwse-resize rounded-sm text-label-secondary opacity-0 transition-opacity hover:bg-muted group-hover/widget:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("DASHBOARD_RESIZE_WIDGET", { title: props.widget.title })}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          resizeRef.current = {
            id: props.widget.id,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            span: props.layout.span,
            height: props.layout.height,
          };
        }}
        onPointerMove={(event) => {
          const start = resizeRef.current;
          if (!start || start.pointerId !== event.pointerId) return;
          const span = closestSpan(start.span + (event.clientX - start.startX) / 120);
          const height = clampHeight(start.height + event.clientY - start.startY);
          props.onChange(start.id, { span, height });
        }}
        onPointerUp={(event) => {
          if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
        }}
      >
        <Maximize2 className="size-3" aria-hidden="true" />
      </button>
    </SortableItem>
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
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(() =>
    readLayout(storageKey, props.widgets),
  );
  const widgetById = useMemo(
    () => new Map(props.widgets.map((widget) => [widget.id, widget])),
    [props.widgets],
  );
  const visibleLayout = layout.filter((item) => item.visible && widgetById.has(item.id));

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ version: DASHBOARD_LAYOUT_VERSION, items: layout }),
      );
    } catch (error) {
      console.error("Failed to persist dashboard layout preferences.", error);
    }
  }, [layout, storageKey]);

  const updateItem = (id: string, update: Partial<DashboardLayoutItem>) => {
    setLayout((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)));
  };

  return (
    <section className={cn("min-w-0 space-y-3", props.className)} aria-label={props.ariaLabel}>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal data-icon="inline-start" />
              {t("DASHBOARD_CUSTOMIZE")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-64">
            <DropdownMenuLabel>{t("DASHBOARD_VISIBLE_WIDGETS")}</DropdownMenuLabel>
            {layout.map((item) => {
              const widget = widgetById.get(item.id);
              if (!widget) return null;
              return (
                <DropdownMenuCheckboxItem
                  key={item.id}
                  checked={item.visible}
                  onCheckedChange={(visible) => updateItem(item.id, { visible: Boolean(visible) })}
                >
                  {widget.title}
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuIconItem
              icon={<RotateCcw />}
              onSelect={() => setLayout(defaultLayout(props.widgets))}
            >
              {t("DASHBOARD_RESET_LAYOUT")}
            </DropdownMenuIconItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Sortable
        value={visibleLayout}
        onValueChange={(nextVisible) => {
          const hidden = layout.filter((item) => !item.visible);
          setLayout([...nextVisible, ...hidden]);
        }}
        getItemValue={(item) => item.id}
        strategy="grid"
        className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-12"
      >
        {visibleLayout.map((item) => {
          const widget = widgetById.get(item.id);
          if (!widget) return null;
          return (
            <DashboardWidgetItem
              key={item.id}
              widget={widget}
              layout={item}
              onChange={updateItem}
            />
          );
        })}
      </Sortable>
    </section>
  );
}
