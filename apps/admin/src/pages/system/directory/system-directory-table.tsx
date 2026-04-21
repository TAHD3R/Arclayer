import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { type ColumnDef } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { UserAvatar } from "@/components/common/entity-avatar";
import { DataTableSearchInput } from "@/components/common/data-table-search-input";
import { buildDataTableToolsLabels } from "@/components/common/data-table-tools-labels";
import { BaseTag, SelectedCountTag, UsesCountTag, lucideTagIcon } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { AdminDataTableSection } from "@/layouts/page-shell/admin-data-table-section";
import { cn } from "@arclayer/lib/utils";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import {
  DataTableToolbarTools,
  useDataTableRowHeightPreference,
  useDataTableWrapHeadersPreference,
} from "@arclayer/ui/data-table";

type SearchableTableHook<T> = {
  table: import("@tanstack/react-table").Table<T>;
  tableId: string;
  searchInput: string;
  setSearchInput: (next: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
  resetColumnVisibility?: () => void;
};

type TableText = {
  emptyTitle: string;
  emptyDescription: string;
  searchPlaceholder: string;
};

type ColumnOptions = {
  id?: string;
  sortKey?: string;
  kind?: "primary" | "meta";
  size?: number;
  minSize?: number;
};

type TagTone = "default" | "green" | "blue" | "red" | "gold";
type TextCellOptions = ColumnOptions & {
  className?: string;
  tooltipClassName?: string;
};

export type SystemDirectoryBulkAction = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

const SELECT_COLUMN_WIDTH = 52;

function renderCellTooltip(trigger: ReactNode, content: ReactNode, className?: string) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild focusTrigger={false}>
          <div className="inline-flex min-w-0 max-w-full align-middle">{trigger}</div>
        </TooltipTrigger>
        <TooltipContent className={cn("max-w-80 break-all", className)}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function renderTruncatedText(
  value: string | number | null | undefined,
  options?: Pick<TextCellOptions, "className" | "tooltipClassName">,
) {
  if (value === null || value === undefined || value === "") return <span>-</span>;

  const text = String(value);
  return renderCellTooltip(
    <span className={cn("block max-w-full truncate", options?.className)}>{text}</span>,
    <span>{text}</span>,
    options?.tooltipClassName,
  );
}

export function createTextColumn<TData>(
  title: string,
  accessor: (row: TData) => string | number | null | undefined,
  options?: ColumnOptions,
): ColumnDef<TData, unknown> {
  return {
    id: options?.id ?? title,
    meta: {
      title,
      sortKey: options?.sortKey,
      kind: options?.kind ?? "meta",
    },
    header: title,
    cell: ({ row }) => {
      const value = accessor(row.original);
      if (value === null || value === undefined || value === "") return <span>-</span>;
      return <span>{String(value)}</span>;
    },
    size: options?.size,
    minSize: options?.minSize,
  };
}

export function createTruncatedTextColumn<TData>(
  title: string,
  accessor: (row: TData) => string | number | null | undefined,
  options?: TextCellOptions,
): ColumnDef<TData, unknown> {
  return {
    id: options?.id ?? title,
    meta: {
      title,
      sortKey: options?.sortKey,
      kind: options?.kind ?? "meta",
    },
    header: title,
    cell: ({ row }) =>
      renderTruncatedText(accessor(row.original), {
        className: options?.className,
        tooltipClassName: options?.tooltipClassName,
      }),
    size: options?.size,
    minSize: options?.minSize,
  };
}

export function createCustomColumn<TData>(
  title: string,
  renderCell: (row: TData) => ReactNode,
  options?: ColumnOptions,
): ColumnDef<TData, unknown> {
  return {
    id: options?.id ?? title,
    meta: {
      title,
      sortKey: options?.sortKey,
      kind: options?.kind ?? "meta",
    },
    header: title,
    cell: ({ row }) => renderCell(row.original),
    size: options?.size,
    minSize: options?.minSize,
  };
}

export function createSelectionColumn<TData>(): ColumnDef<TData, unknown> {
  return {
    id: "select",
    enableSorting: false,
    enableHiding: false,
    meta: {
      title: "",
      kind: "select",
      headerAlign: "center",
      pin: "left",
    },
    header: ({ table }) => (
      <div className="flex w-full items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          aria-label="Select all rows"
          onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex w-full items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          aria-label="Select row"
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
        />
      </div>
    ),
    size: SELECT_COLUMN_WIDTH,
    minSize: SELECT_COLUMN_WIDTH,
  };
}

export function createActionsColumn<TData>(options: {
  renderActions: (row: TData) => ReactNode;
  size?: number;
  minSize?: number;
}): ColumnDef<TData, unknown> {
  return {
    id: "actions",
    enableSorting: false,
    enableHiding: false,
    meta: buildDataTableActionsColumnMeta("right", "right"),
    header: "",
    cell: ({ row }) => (
      <DataTableActionsCell>{options.renderActions(row.original)}</DataTableActionsCell>
    ),
    size: options.size ?? 208,
    minSize: options.minSize ?? 196,
  };
}

export function createDateColumn<TData>(
  title: string,
  accessor: (row: TData) => string | null | undefined,
  formatter: ReturnType<typeof useAdminDateTimeFormatter>,
  options?: ColumnOptions,
): ColumnDef<TData, unknown> {
  return {
    id: options?.id ?? title,
    meta: {
      title,
      sortKey: options?.sortKey,
      kind: "time",
    },
    header: title,
    cell: ({ row }) => {
      const value = accessor(row.original);
      return value ? <span>{formatter.formatDateTime(value)}</span> : <span>-</span>;
    },
    size: options?.size ?? 190,
    minSize: options?.minSize ?? 170,
  };
}

export function renderTag(
  label: ReactNode,
  options?: {
    tone?: TagTone;
    icon?: LucideIcon;
    className?: string;
  },
) {
  return (
    <BaseTag
      color={options?.tone ?? "default"}
      icon={options?.icon ? lucideTagIcon(options.icon) : undefined}
      className={options?.className}
      textStyle="caption"
    >
      {label}
    </BaseTag>
  );
}

export function renderTruncatedTag(
  label: string | null | undefined,
  options?: {
    tone?: TagTone;
    icon?: LucideIcon;
    className?: string;
    textClassName?: string;
    tooltipClassName?: string;
  },
) {
  if (!label) return <span>-</span>;

  return renderCellTooltip(
    renderTag(
      <span
        className={cn(
          "block min-w-0 max-w-full truncate whitespace-nowrap",
          options?.textClassName,
        )}
      >
        {label}
      </span>,
      {
        tone: options?.tone,
        icon: options?.icon,
        className: cn("max-w-[12rem] overflow-hidden", options?.className),
      },
    ),
    <span>{label}</span>,
    options?.tooltipClassName,
  );
}

export function renderCountTag(count: number) {
  return <UsesCountTag label={String(count)} textStyle="caption" />;
}

export function renderTagWithTooltip(
  label: string | null | undefined,
  options?: {
    tone?: TagTone;
    icon?: LucideIcon;
    className?: string;
    textClassName?: string;
    tooltipClassName?: string;
  },
) {
  return renderTruncatedTag(label, {
    tone: options?.tone,
    icon: options?.icon,
    className: options?.className,
    textClassName: cn("max-w-[14rem]", options?.textClassName),
    tooltipClassName: options?.tooltipClassName,
  });
}

export function renderSlugTag(slug: string | null | undefined) {
  return renderTagWithTooltip(slug, {
    tone: "default",
    className: "max-w-[14rem]",
    textClassName: "max-w-[14rem]",
    tooltipClassName: "max-w-[28rem]",
  });
}

export function createOwnerCell<
  TData extends {
    owner?: {
      displayName?: string | null;
      username?: string;
      email?: string | null;
      avatarUrl?: string | null;
      avatar_url?: string | null;
    } | null;
  },
>(title: string, options?: ColumnOptions): ColumnDef<TData, unknown> {
  return {
    id: options?.id ?? "owner",
    meta: {
      title,
      sortKey: options?.sortKey,
      kind: "meta",
    },
    header: title,
    cell: ({ row }) => {
      const owner = row.original.owner;
      if (!owner) return <span>-</span>;
      const primary = owner.displayName || owner.username;
      return renderCellTooltip(
        <div className="ml-1 flex min-w-0 items-center gap-3">
          <UserAvatar name={primary} assetRef={owner.avatarUrl ?? owner.avatar_url} size={28} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{primary}</div>
            {owner.email ? (
              <div className="truncate text-xs text-muted-foreground">{owner.email}</div>
            ) : null}
          </div>
        </div>,
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">{primary}</div>
          {owner.email ? <div className="text-xs text-muted-foreground">{owner.email}</div> : null}
        </div>,
        "max-w-72 break-normal",
      );
    },
    size: options?.size ?? 220,
    minSize: options?.minSize ?? 200,
  };
}

export function createUserIdentityCell<
  TData extends {
    displayName?: string | null;
    username: string;
    email?: string | null;
    avatarUrl?: string | null;
    avatar_url?: string | null;
  },
>(title: string, options?: ColumnOptions): ColumnDef<TData, unknown> {
  return {
    id: options?.id ?? "user",
    meta: {
      title,
      sortKey: options?.sortKey,
      kind: options?.kind ?? "primary",
    },
    header: title,
    cell: ({ row }) => {
      const user = row.original;
      const primary = user.displayName || user.username;
      return renderCellTooltip(
        <div className="ml-1 flex min-w-0 items-center gap-3">
          <UserAvatar name={primary} assetRef={user.avatarUrl ?? user.avatar_url} size={28} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{primary}</div>
            {user.email ? (
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            ) : null}
          </div>
        </div>,
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground">{primary}</div>
          {user.email ? <div className="text-xs text-muted-foreground">{user.email}</div> : null}
        </div>,
        "max-w-72 break-normal",
      );
    },
    size: options?.size ?? 260,
    minSize: options?.minSize ?? 220,
  };
}

export function SystemDirectoryTable<TData>(props: {
  tableHook: SearchableTableHook<TData>;
  text: TableText;
  onRowClick?: (row: TData) => void;
  bulkActions?: SystemDirectoryBulkAction[];
}) {
  const { t } = useTranslation(["common", "settings"]);
  const [rowHeight, setRowHeight] = useDataTableRowHeightPreference({
    tableId: props.tableHook.tableId,
  });
  const [wrapHeaders, setWrapHeaders] = useDataTableWrapHeadersPreference({
    tableId: props.tableHook.tableId,
  });
  const selectedCount = props.tableHook.table.getSelectedRowModel().rows.length;
  const toolsLabels = useMemo(() => buildDataTableToolsLabels(t), [t]);

  const toolbar = useMemo(
    () => (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <DataTableSearchInput
            value={props.tableHook.searchInput}
            onChange={props.tableHook.setSearchInput}
            placeholder={props.text.searchPlaceholder}
            clearLabel={t("common:CLEAR")}
            className="w-full max-w-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <DataTableToolbarTools
            table={props.tableHook.table}
            rowHeight={rowHeight}
            onRowHeightChange={setRowHeight}
            wrapHeaders={wrapHeaders}
            onWrapHeadersChange={setWrapHeaders}
            onRefresh={() => void props.tableHook.refetch()}
            refreshing={props.tableHook.isFetching && !props.tableHook.isLoading}
            onResetColumnVisibility={props.tableHook.resetColumnVisibility}
            labels={toolsLabels}
          />
        </div>
      </div>
    ),
    [
      props.tableHook.isFetching,
      props.tableHook.isLoading,
      props.tableHook.refetch,
      props.tableHook.resetColumnVisibility,
      props.tableHook.searchInput,
      props.tableHook.setSearchInput,
      props.tableHook.table,
      props.text.searchPlaceholder,
      rowHeight,
      setRowHeight,
      setWrapHeaders,
      t,
      toolsLabels,
      wrapHeaders,
    ],
  );

  const footerSlot =
    selectedCount > 0 ? (
      <AnimatePresence>
        <motion.div
          key="system-directory-selection-toolbar"
          className="pointer-events-none sticky bottom-0 z-30 mt-auto w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
        >
          <div className="pointer-events-auto w-full border-t border-border bg-background">
            <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 pt-3 pb-5 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <SelectedCountTag
                  label={t("settings:SETTINGS_SYSTEM_DIRECTORY_SELECTED_COUNT", {
                    count: selectedCount,
                  })}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => props.tableHook.table.resetRowSelection()}
                >
                  {t("common:DATA_TABLE_CLEAR_SELECTION")}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {props.bulkActions?.map((action) => (
                  <Button
                    key={action.key}
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={action.disabled}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    ) : null;

  return (
    <AdminDataTableSection
      table={props.tableHook.table}
      emptyText={t("common:EMPTY_DESC")}
      emptyTitle={props.text.emptyTitle}
      emptyDescription={props.text.emptyDescription}
      loading={props.tableHook.isLoading}
      error={props.tableHook.error}
      onRetry={() => void props.tableHook.refetch()}
      t={(key, options) => t(key, options)}
      rowHeight={rowHeight}
      wrapHeaders={wrapHeaders}
      refreshing={props.tableHook.isFetching && !props.tableHook.isLoading}
      rowClassName={() => (props.onRowClick ? "cursor-pointer" : undefined)}
      onRowClick={
        props.onRowClick
          ? (row) => {
              const onRowClick = props.onRowClick;
              if (!onRowClick) return;
              onRowClick(row.original);
            }
          : undefined
      }
      toolbar={toolbar}
      footerSlot={footerSlot}
    />
  );
}

export function useSystemDirectoryDateTimeFormatter() {
  return useAdminDateTimeFormatter({ workspaceId: null });
}
