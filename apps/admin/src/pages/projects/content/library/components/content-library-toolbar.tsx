import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyPlusIcon,
  ChevronLeft,
  ChevronRight,
  FileStackIcon,
  FunnelXIcon,
  Layers3Icon,
  ListFilterIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCcwIcon,
  Trash2Icon,
} from "lucide-react";
import type { Table as ReactTable } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import { DataTableToolbarTools, type DataTableToolsLabels } from "@arclayer/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Filters, createFilter, type Filter, type FilterFieldConfig } from "@arclayer/ui/filters";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import { cn } from "@arclayer/lib/utils";
import { Badge } from "@arclayer/ui/badge";

import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { DataTableToolbarAntdIconButton } from "@/components/common/data-table-toolbar-antd-icon-button";
import {
  ViewModeToggle,
  type ViewMode as ContentLibraryViewMode,
} from "@/components/common/view-mode-toggle";
import { PageExtraToolbar } from "@/layouts/page-shell/page-extra-toolbar";
import { buildReuiFilterI18n } from "@/components/common/reui-filter-i18n";
import type {
  ContentLibraryDerivedStatus,
  ContentLibraryEditWith,
  ContentLibraryRole,
  ContentLibraryToolbarFilters,
} from "../types";
import { ContentLibraryCreateViewPopover } from "./content-library-create-view-popover";
import type { ContentLibraryPrototypeViewDraft } from "./content-library-view-form";

type FilterValue = string;
const VIEW_SCROLL_THRESHOLD_PX = 1;
const VIEW_SCROLL_DELTA_PX = 240;

type ViewScrollState = Readonly<{
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}>;

type ContentLibraryToolbarView = {
  id: string;
  label: string;
  active?: boolean;
  dirty?: boolean;
  onSelect?: () => void;
  onMoveForward?: () => void;
  moveForwardDisabled?: boolean;
  onMoveBackward?: () => void;
  moveBackwardDisabled?: boolean;
  onEdit?: () => void;
  onSaveAs?: () => void;
  onUpdate?: () => void;
  updateDisabled?: boolean;
  updateDisabledReason?: string;
  onDelete?: () => void;
};

function ContentLibraryToolbarViewChip(props: { view: ContentLibraryToolbarView }) {
  const { t } = useTranslation("content");
  const [hovered, setHovered] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [focusWithin, setFocusWithin] = React.useState(false);
  const labelRef = React.useRef<HTMLSpanElement | null>(null);
  const [labelTruncated, setLabelTruncated] = React.useState(false);
  const hasMenu =
    Boolean(props.view.onMoveForward) ||
    Boolean(props.view.onMoveBackward) ||
    Boolean(props.view.onEdit) ||
    Boolean(props.view.onSaveAs) ||
    Boolean(props.view.onUpdate) ||
    Boolean(props.view.onDelete);
  const showMenuButton = hasMenu && (props.view.active || hovered || menuOpen || focusWithin);
  const emphasized = props.view.active || hovered || menuOpen || focusWithin;
  const hasMoveActions = Boolean(props.view.onMoveForward) || Boolean(props.view.onMoveBackward);
  const hasSecondaryActions =
    Boolean(props.view.onSaveAs) || Boolean(props.view.onUpdate) || Boolean(props.view.onDelete);
  const handlePointerEnter = React.useCallback(() => {
    setHovered(true);
  }, []);
  const handlePointerLeave = React.useCallback(() => {
    setHovered(false);
  }, []);
  const handleFocusCapture = React.useCallback(() => {
    setFocusWithin(true);
  }, []);
  const handleBlurCapture = React.useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setFocusWithin(false);
  }, []);
  React.useEffect(() => {
    const node = labelRef.current;
    if (!node) return;

    const syncLabelTruncation = () => {
      setLabelTruncated(node.scrollWidth > node.clientWidth + 1);
    };

    syncLabelTruncation();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncLabelTruncation) : null;
    resizeObserver?.observe(node);

    return () => {
      resizeObserver?.disconnect();
    };
  }, [props.view.label, props.view.dirty, showMenuButton]);

  const viewButton = (
    <button
      type="button"
      data-active-view={props.view.active ? "true" : "false"}
      aria-current={props.view.active ? "true" : undefined}
      className={cn(
        "flex h-9 min-w-0 shrink items-center rounded-md bg-transparent px-3 text-callout font-semibold outline-none transition-colors",
        emphasized ? "text-accent-foreground" : "text-inherit",
        showMenuButton ? "pr-2" : "pr-3",
      )}
      onPointerEnter={handlePointerEnter}
      onMouseEnter={handlePointerEnter}
      onClick={props.view.onSelect}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span ref={labelRef} className="max-w-[12rem] truncate whitespace-nowrap">
          {props.view.label}
        </span>
        {props.view.dirty ? (
          <Badge
            variant="outline"
            aria-hidden="true"
            className={cn(
              "shrink-0 border-amber-300/80 bg-amber-50/90 px-1.5 py-0 text-caption text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-300",
              emphasized ? "border-amber-300/80 bg-amber-50/90" : undefined,
            )}
          >
            {t("CONTENT_LIBRARY_VIEW_DIRTY_TAG")}
          </Badge>
        ) : null}
      </span>
    </button>
  );

  return (
    <div
      className={cn(
        "flex min-h-9 shrink-0 items-center rounded-md border border-transparent transition-colors duration-200 ease-out",
        emphasized
          ? "border-border/70 bg-accent text-accent-foreground "
          : "bg-transparent text-label-primary hover:bg-accent/80 hover:text-accent-foreground",
        props.view.active ? "ring-1 ring-inset ring-border/80" : "",
      )}
      onPointerLeave={handlePointerLeave}
      onMouseLeave={handlePointerLeave}
      onFocusCapture={handleFocusCapture}
      onBlurCapture={handleBlurCapture}
    >
      {labelTruncated ? (
        <Tooltip>
          <TooltipTrigger asChild>{viewButton}</TooltipTrigger>
          <TooltipContent>{props.view.label}</TooltipContent>
        </Tooltip>
      ) : (
        viewButton
      )}
      {hasMenu ? (
        <div
          className={cn(
            "flex items-center overflow-hidden transition-all duration-200 ease-out",
            showMenuButton ? "w-9 opacity-100" : "w-0 opacity-0 pointer-events-none",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-4 w-px shrink-0 transition-colors duration-200",
              emphasized ? "bg-border/70" : "bg-border/40",
            )}
          />
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "mr-1 flex size-7 items-center justify-center rounded-sm bg-transparent outline-none transition-all duration-200 ease-out",
                  emphasized ? "text-accent-foreground" : "text-label-secondary",
                  props.view.active
                    ? "hover:bg-card/70 focus-visible:bg-card/70"
                    : "hover:bg-card/70 focus-visible:bg-card/70",
                )}
                aria-label={t("CONTENT_LIBRARY_ACTION_VIEW_MENU")}
                aria-hidden={!showMenuButton}
                tabIndex={showMenuButton ? 0 : -1}
                onPointerEnter={handlePointerEnter}
                onMouseEnter={handlePointerEnter}
              >
                <MoreHorizontalIcon className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {props.view.onEdit ? (
                <DropdownMenuItem onSelect={props.view.onEdit}>
                  <DropdownMenuItemContent icon={<PencilIcon className="size-4" />}>
                    {t("CONTENT_LIBRARY_ACTION_EDIT_VIEW")}
                  </DropdownMenuItemContent>
                </DropdownMenuItem>
              ) : null}
              {props.view.onMoveForward ? (
                <DropdownMenuItem
                  disabled={props.view.moveForwardDisabled}
                  onSelect={props.view.onMoveForward}
                >
                  <DropdownMenuItemContent icon={<ArrowUpIcon className="size-4" />}>
                    {t("CONTENT_LIBRARY_ACTION_MOVE_VIEW_FORWARD")}
                  </DropdownMenuItemContent>
                </DropdownMenuItem>
              ) : null}
              {props.view.onMoveBackward ? (
                <DropdownMenuItem
                  disabled={props.view.moveBackwardDisabled}
                  onSelect={props.view.onMoveBackward}
                >
                  <DropdownMenuItemContent icon={<ArrowDownIcon className="size-4" />}>
                    {t("CONTENT_LIBRARY_ACTION_MOVE_VIEW_BACKWARD")}
                  </DropdownMenuItemContent>
                </DropdownMenuItem>
              ) : null}
              {hasMoveActions && hasSecondaryActions ? <DropdownMenuSeparator /> : null}
              {props.view.onSaveAs ? (
                <DropdownMenuItem onSelect={props.view.onSaveAs}>
                  <DropdownMenuItemContent icon={<CopyPlusIcon className="size-4" />}>
                    {t("CONTENT_LIBRARY_ACTION_SAVE_AS_VIEW")}
                  </DropdownMenuItemContent>
                </DropdownMenuItem>
              ) : null}
              {props.view.onUpdate ? (
                props.view.updateDisabled ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="w-full">
                        <DropdownMenuItem disabled>
                          <DropdownMenuItemContent icon={<RefreshCcwIcon className="size-4" />}>
                            {t("CONTENT_LIBRARY_ACTION_UPDATE_VIEW")}
                          </DropdownMenuItemContent>
                        </DropdownMenuItem>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {props.view.updateDisabledReason ??
                        t("CONTENT_LIBRARY_UPDATE_VIEW_DISABLED_TOOLTIP")}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <DropdownMenuItem onSelect={props.view.onUpdate}>
                    <DropdownMenuItemContent icon={<RefreshCcwIcon className="size-4" />}>
                      {t("CONTENT_LIBRARY_ACTION_UPDATE_VIEW")}
                    </DropdownMenuItemContent>
                  </DropdownMenuItem>
                )
              ) : null}
              {props.view.onDelete ? (
                <DropdownMenuItem variant="destructive" onSelect={props.view.onDelete}>
                  <DropdownMenuItemContent icon={<Trash2Icon className="size-4" />}>
                    {t("CONTENT_LIBRARY_ACTION_DELETE_VIEW")}
                  </DropdownMenuItemContent>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
}

function getViewScrollState(el: HTMLDivElement): ViewScrollState {
  return {
    hasOverflow: el.scrollWidth > el.clientWidth + VIEW_SCROLL_THRESHOLD_PX,
    canScrollLeft: el.scrollLeft > VIEW_SCROLL_THRESHOLD_PX,
    canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - VIEW_SCROLL_THRESHOLD_PX,
  };
}

function toReuiFilters(filters: ContentLibraryToolbarFilters): Filter<FilterValue>[] {
  const next: Filter<FilterValue>[] = [];
  if (filters.status) next.push(createFilter("status", "is", [filters.status]));
  if (filters.modelKey) next.push(createFilter("modelKey", "is", [filters.modelKey]));
  if (filters.role) next.push(createFilter("role", "is", [filters.role]));
  if (filters.editWith) next.push(createFilter("editWith", "is", [filters.editWith]));
  return next;
}

function fromReuiFilters(filters: Filter<FilterValue>[]): ContentLibraryToolbarFilters {
  const next: ContentLibraryToolbarFilters = {};
  for (const filter of filters) {
    const first = filter.values[0];
    if (typeof first !== "string" || !first) continue;
    if (filter.field === "status") next.status = first as ContentLibraryDerivedStatus;
    if (filter.field === "modelKey") next.modelKey = first;
    if (filter.field === "role") next.role = first as ContentLibraryRole;
    if (filter.field === "editWith") next.editWith = first as ContentLibraryEditWith;
  }
  return next;
}

export function ContentLibraryToolbar<TData>(props: {
  table: ReactTable<TData>;
  searchInput: string;
  onSearchInputChange: (value: string) => void;
  filters: ContentLibraryToolbarFilters;
  onFiltersChange: (next: ContentLibraryToolbarFilters) => void;
  refreshing?: boolean;
  onRefresh: () => void;
  onResetColumnVisibility?: () => void;
  toolsLabels: DataTableToolsLabels;
  modelOptions: Array<{ value: string; label: string }>;
  viewMode: ContentLibraryViewMode;
  onViewModeChange: (next: ContentLibraryViewMode) => void;
  views?: ContentLibraryToolbarView[];
  onCreateView?: (draft: ContentLibraryPrototypeViewDraft) => Promise<void> | void;
  primaryAction?: React.ReactNode;
}) {
  const { t } = useTranslation(["common", "content"]);

  const filterItems = React.useMemo(() => toReuiFilters(props.filters), [props.filters]);
  const reuiI18n = React.useMemo(
    () => buildReuiFilterI18n(t, t("content:CONTENT_LIBRARY_FILTER_TITLE")),
    [t],
  );
  const viewsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [viewScrollState, setViewScrollState] = React.useState<ViewScrollState>({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const fields = React.useMemo<FilterFieldConfig<FilterValue>[]>(
    () => [
      {
        key: "status",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_STATUS"),
        type: "select",
        icon: <ListFilterIcon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: [
          { value: "published", label: t("content:CONTENT_LIBRARY_STATUS_PUBLISHED") },
          { value: "changed", label: t("content:CONTENT_LIBRARY_STATUS_CHANGED") },
          { value: "draft", label: t("content:CONTENT_LIBRARY_STATUS_DRAFT") },
          { value: "archived", label: t("content:CONTENT_LIBRARY_STATUS_ARCHIVED") },
        ],
      },
      {
        key: "role",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_ROLE"),
        type: "select",
        icon: <FileStackIcon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: [
          { value: "page", label: t("content:CONTENT_LIBRARY_ROLE_PAGE") },
          { value: "article", label: t("content:CONTENT_LIBRARY_ROLE_ARTICLE") },
          { value: "reusable-section", label: t("content:CONTENT_LIBRARY_ROLE_REUSABLE_SECTION") },
          { value: "taxonomy", label: t("content:CONTENT_LIBRARY_ROLE_TAXONOMY") },
          { value: "person", label: t("content:CONTENT_LIBRARY_ROLE_PERSON") },
          { value: "settings", label: t("content:CONTENT_LIBRARY_ROLE_SETTINGS") },
          { value: "data", label: t("content:CONTENT_LIBRARY_ROLE_DATA") },
          { value: "general", label: t("content:CONTENT_LIBRARY_ROLE_GENERAL") },
        ],
      },
      {
        key: "editWith",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_EDIT_WITH"),
        type: "select",
        icon: <Layers3Icon className="size-4" />,
        searchable: false,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: [
          { value: "writing", label: t("content:CONTENT_LIBRARY_EDIT_WITH_WRITING") },
          { value: "canvas", label: t("content:CONTENT_LIBRARY_EDIT_WITH_CANVAS") },
          { value: "structured", label: t("content:CONTENT_LIBRARY_EDIT_WITH_STRUCTURED") },
        ],
      },
      {
        key: "modelKey",
        label: t("content:CONTENT_LIBRARY_FILTER_FIELD_CONTENT_TYPE"),
        type: "select",
        icon: <Layers3Icon className="size-4" />,
        searchable: true,
        operators: [{ value: "is", label: t("common:FILTER_OPERATOR_IS") }],
        options: props.modelOptions,
      },
    ],
    [props.modelOptions, t],
  );

  const syncViewScrollState = React.useCallback(() => {
    const el = viewsScrollRef.current;
    if (!el) return;

    const next = getViewScrollState(el);
    setViewScrollState((prev) =>
      prev.hasOverflow === next.hasOverflow &&
      prev.canScrollLeft === next.canScrollLeft &&
      prev.canScrollRight === next.canScrollRight
        ? prev
        : next,
    );
  }, []);

  React.useEffect(() => {
    const el = viewsScrollRef.current;
    if (!el) return;

    syncViewScrollState();
    el.addEventListener("scroll", syncViewScrollState, { passive: true });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncViewScrollState) : null;
    resizeObserver?.observe(el);

    return () => {
      el.removeEventListener("scroll", syncViewScrollState);
      resizeObserver?.disconnect();
    };
  }, [syncViewScrollState]);

  React.useEffect(() => {
    const el = viewsScrollRef.current;
    if (!el) return;

    syncViewScrollState();

    const activeView = el.querySelector<HTMLElement>('[data-active-view="true"]');
    if (!activeView) return;

    const listRect = el.getBoundingClientRect();
    const activeRect = activeView.getBoundingClientRect();
    if (activeRect.left >= listRect.left && activeRect.right <= listRect.right) return;

    activeView.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [props.views, syncViewScrollState]);

  const scrollViews = React.useCallback((direction: "left" | "right") => {
    const el = viewsScrollRef.current;
    if (!el) return;

    el.scrollBy({
      left: direction === "left" ? -VIEW_SCROLL_DELTA_PX : VIEW_SCROLL_DELTA_PX,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {viewScrollState.hasOverflow ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-md"
              aria-label={t("content:CONTENT_LIBRARY_ACTION_SCROLL_VIEWS_LEFT")}
              disabled={!viewScrollState.canScrollLeft}
              onClick={() => scrollViews("left")}
            >
              <ChevronLeft className="size-4" />
            </Button>
          ) : null}
          <div
            ref={viewsScrollRef}
            className="min-w-0 flex-1 self-stretch overflow-x-auto overflow-y-hidden scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex min-h-9 min-w-max items-center gap-2 pr-1">
              {(props.views ?? []).map((view) => (
                <ContentLibraryToolbarViewChip key={view.id} view={view} />
              ))}
            </div>
          </div>
          {viewScrollState.hasOverflow ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-9 shrink-0 rounded-md"
              aria-label={t("content:CONTENT_LIBRARY_ACTION_SCROLL_VIEWS_RIGHT")}
              disabled={!viewScrollState.canScrollRight}
              onClick={() => scrollViews("right")}
            >
              <ChevronRight className="size-4" />
            </Button>
          ) : null}
          {props.onCreateView ? (
            <ContentLibraryCreateViewPopover onCreate={props.onCreateView} />
          ) : null}
        </div>
      </div>

      <PageExtraToolbar
        className="items-center"
        leading={
          <>
            <DataTableSearchInput
              value={props.searchInput}
              onChange={props.onSearchInputChange}
              placeholder={t("content:CONTENT_LIBRARY_SEARCH_PLACEHOLDER")}
              clearLabel={t("common:CLEAR")}
            />

            <Filters
              filters={filterItems}
              fields={fields}
              onChange={(next) => props.onFiltersChange(fromReuiFilters(next))}
              i18n={reuiI18n}
              allowMultiple={false}
              enableShortcut
              shortcutKey="f"
              shortcutLabel="F"
              trigger={
                <Button variant="outline">
                  <ListFilterIcon className="size-4" />
                </Button>
              }
            />

            {filterItems.length > 0 ? (
              <Button variant="outline" onClick={() => props.onFiltersChange({})}>
                <FunnelXIcon className="size-4" />
                {t("content:CONTENT_LIBRARY_FILTER_RESET")}
              </Button>
            ) : null}
          </>
        }
        trailing={
          <>
            {props.primaryAction}
            <DataTableToolbarTools
              table={props.table}
              onRefresh={props.onRefresh}
              refreshing={props.refreshing}
              onResetColumnVisibility={props.onResetColumnVisibility}
              labels={props.toolsLabels}
              components={{ IconButton: DataTableToolbarAntdIconButton }}
            />
            <ViewModeToggle t={t} value={props.viewMode} onChange={props.onViewModeChange} />
          </>
        }
        leadingClassName="items-center"
        trailingClassName="justify-end"
      />
    </div>
  );
}
