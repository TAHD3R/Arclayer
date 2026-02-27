import type { ColumnDef } from "@tanstack/react-table";
import { Avatar, Tag } from "antd";
import { Copy, ExternalLink, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { ContentPageRow } from "../types";
import { resolveDisplayName } from "../utils";

type BuildContentPagesColumnsOptions = {
  t: (key: string, options?: Record<string, unknown>) => string;
  formatUpdatedAt: (value: string | null) => string | null;
  onOpenEditor: (row: ContentPageRow) => void;
  onEdit: (row: ContentPageRow) => void;
  onDuplicate: (row: ContentPageRow) => void;
  onDelete: (row: ContentPageRow) => void;
  processingIds: Set<string>;
};

function renderStatusTag(
  status: ContentPageRow["status"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return (
    <Tag color={status === "published" ? "green" : "gold"} style={{ marginInlineEnd: 0 }}>
      {status === "published"
        ? t("content_pages:INDEX_STATUS_PUBLISHED")
        : t("content_pages:INDEX_STATUS_DRAFT")}
    </Tag>
  );
}

// Row-level dropdown menu using the design system DropdownMenu
function RowActionsMenu({
  row,
  options,
}: {
  row: ContentPageRow;
  options: BuildContentPagesColumnsOptions;
}) {
  const processing = options.processingIds.has(row.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-7 w-7 p-0 self-center"
          disabled={processing}
          aria-label={options.t("content_pages:INDEX_ACTION_MORE")}
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => options.onOpenEditor(row)}>
          <ExternalLink className="size-4" />
          {options.t("content_pages:INDEX_ACTION_OPEN_EDITOR")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => options.onEdit(row)}>
          <Pencil className="size-4" />
          {options.t("content_pages:MENU_EDIT")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => options.onDuplicate(row)}>
          <Copy className="size-4" />
          {options.t("content_pages:MENU_DUPLICATE")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => options.onDelete(row)}>
          <Trash2 className="size-4" />
          {options.t("content_pages:MENU_DELETE")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function buildContentPagesColumns(
  options: BuildContentPagesColumnsOptions,
): ColumnDef<ContentPageRow, unknown>[] {
  return [
    {
      id: "select",
      meta: {
        title: "Select",
        kind: "select",
      },
      header: ({ table }) => (
        <Checkbox
          aria-label={options.t("content_pages:TABLE_SELECT_ALL")}
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={options.t("content_pages:TABLE_SELECT_ROW")}
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 48,
      minSize: 48,
      maxSize: 48,
    },
    {
      id: "name",
      meta: {
        title: options.t("content_pages:INDEX_COL_NAME"),
        sortKey: "title",
      },
      header: options.t("content_pages:INDEX_COL_NAME"),
      cell: ({ row }) => {
        const item = row.original;
        const prefix = item.level > 0 ? `${"· ".repeat(Math.min(item.level, 4))}` : "";
        const displayName = `${prefix}${resolveDisplayName(item)}`;

        return (
          <div className="min-w-0 max-w-[18rem]">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1 grid gap-1">
                <div className="font-medium truncate">{displayName}</div>
                <Tag
                  style={{ marginInlineEnd: 0 }}
                  className="w-fit max-w-full truncate align-middle justify-self-start"
                >
                  {item.path}
                </Tag>

                {item.description ? (
                  <div className="text-label-secondary text-caption truncate">
                    {item.description}
                  </div>
                ) : null}
              </div>

              <RowActionsMenu row={item} options={options} />
            </div>
          </div>
        );
      },
      size: 180,
      minSize: 180,
      maxSize: 240,
    },
    {
      id: "type",
      accessorFn: (row) => row.pageType,
      meta: {
        title: options.t("content_pages:INDEX_COL_TYPE"),
      },
      header: options.t("content_pages:INDEX_COL_TYPE"),
      cell: ({ row }) => (
        <Tag
          color={row.original.pageType === "template" ? "purple" : "blue"}
          style={{ marginInlineEnd: 0 }}
        >
          {row.original.pageType === "template"
            ? options.t("content_pages:INDEX_TYPE_TEMPLATE")
            : options.t("content_pages:INDEX_TYPE_STATIC")}
        </Tag>
      ),
      enableSorting: false,
      size: 100,
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      meta: {
        title: options.t("content_pages:INDEX_COL_STATUS"),
        sortKey: "status",
      },
      header: options.t("content_pages:INDEX_COL_STATUS"),
      cell: ({ row }) => renderStatusTag(row.original.status, options.t),
      size: 100,
    },
    {
      id: "updatedAt",
      accessorFn: (row) => row.updatedAt,
      meta: {
        title: options.t("content_pages:INDEX_COL_UPDATED_AT"),
        sortKey: "updated_at",
      },
      header: options.t("content_pages:INDEX_COL_UPDATED_AT"),
      cell: ({ row }) => {
        const formatted = options.formatUpdatedAt(row.original.updatedAt);
        return (
          <span className={formatted ? "" : "text-label-secondary"}>
            {formatted || options.t("content_pages:PLACEHOLDER_DASH")}
          </span>
        );
      },
    },
    {
      id: "updatedBy",
      accessorFn: (row) => row.updatedBy?.displayName || row.updatedBy?.email || "",
      meta: {
        title: options.t("content_pages:INDEX_COL_UPDATED_BY"),
      },
      header: options.t("content_pages:INDEX_COL_UPDATED_BY"),
      cell: ({ row }) => {
        const user = row.original.updatedBy;
        if (!user) return <span className="text-label-secondary">-</span>;

        const primary = user.displayName?.trim() || user.email?.trim() || "-";
        const secondary = user.email?.trim() || "";

        return (
          <div className="flex items-center gap-2 min-w-48">
            <Avatar src={user.avatarUrl || undefined} size={24}>
              {primary.slice(0, 1).toUpperCase()}
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium truncate">{primary}</div>
              {secondary ? (
                <div className="text-footnote text-label-secondary truncate">{secondary}</div>
              ) : null}
            </div>
          </div>
        );
      },
      enableSorting: false,
    },
  ];
}
