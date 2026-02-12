import type { ColumnDef } from "@tanstack/react-table";
import { Avatar, Button as AntButton, Dropdown, Tag } from "antd";
import type { MenuProps } from "antd";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import type { ContentPageRow } from "./content-pages-types";
import { resolveDisplayName } from "./content-pages-utils";

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

function renderVisibilityTag(
  visibility: ContentPageRow["visibility"],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return (
    <Tag color={visibility === "public" ? "green" : "volcano"} style={{ marginInlineEnd: 0 }}>
      {visibility === "public"
        ? t("content_pages:INDEX_FILTER_VISIBILITY_PUBLIC")
        : t("content_pages:INDEX_FILTER_VISIBILITY_PRIVATE")}
    </Tag>
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
        return (
          <div className="min-w-64">
            <div className="font-medium truncate">{`${prefix}${resolveDisplayName(item)}`}</div>
            {item.description ? (
              <div className="text-muted-foreground text-xs truncate">{item.description}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "type",
      accessorFn: (row) => row.pageType,
      meta: {
        title: options.t("content_pages:INDEX_COL_TYPE"),
      },
      header: options.t("content_pages:INDEX_COL_TYPE"),
      cell: ({ row }) => (
        <Tag color={row.original.pageType === "template" ? "purple" : "blue"} style={{ marginInlineEnd: 0 }}>
          {row.original.pageType === "template"
            ? options.t("content_pages:INDEX_TYPE_TEMPLATE")
            : options.t("content_pages:INDEX_TYPE_STATIC")}
        </Tag>
      ),
      enableSorting: false,
    },
    {
      id: "path",
      accessorFn: (row) => row.path,
      meta: {
        title: options.t("content_pages:COL_PATH"),
        sortKey: "path",
      },
      header: options.t("content_pages:COL_PATH"),
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.path}</span>,
    },
    {
      id: "visibility",
      accessorFn: (row) => row.visibility,
      meta: {
        title: options.t("content_pages:COL_VISIBILITY"),
        sortKey: "visibility",
      },
      header: options.t("content_pages:COL_VISIBILITY"),
      cell: ({ row }) => renderVisibilityTag(row.original.visibility, options.t),
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
        if (!user) return <span className="text-muted-foreground">-</span>;

        const primary = user.displayName?.trim() || user.email?.trim() || "-";
        const secondary = user.email?.trim() || "";

        return (
          <div className="flex items-center gap-2 min-w-48">
            <Avatar src={user.avatarUrl || undefined} size={24}>
              {primary.slice(0, 1).toUpperCase()}
            </Avatar>
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{primary}</div>
              {secondary ? <div className="text-xs text-muted-foreground truncate">{secondary}</div> : null}
            </div>
          </div>
        );
      },
      enableSorting: false,
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
          <span className={formatted ? "" : "text-muted-foreground"}>
            {formatted || options.t("content_pages:PLACEHOLDER_DASH")}
          </span>
        );
      },
    },
    {
      id: "actions",
      meta: {
        title: options.t("content_pages:COL_ACTIONS"),
        kind: "actions",
      },
      header: options.t("content_pages:COL_ACTIONS"),
      cell: ({ row }) => {
        const item = row.original;
        const processing = options.processingIds.has(item.id);

        const menuItems: MenuProps["items"] = [
          {
            key: "edit",
            icon: <Pencil className="size-4" />,
            label: options.t("content_pages:MENU_EDIT"),
            onClick: () => options.onEdit(item),
          },
          {
            key: "duplicate",
            icon: <Copy className="size-4" />,
            label: options.t("content_pages:MENU_DUPLICATE"),
            onClick: () => options.onDuplicate(item),
          },
          { type: "divider" },
          {
            key: "delete",
            icon: <Trash2 className="size-4" />,
            danger: true,
            label: options.t("content_pages:MENU_DELETE"),
            onClick: () => options.onDelete(item),
          },
        ];

        return (
          <div className="flex items-center justify-end gap-2">
            <AntButton
              type="default"
              size="small"
              onClick={() => options.onOpenEditor(item)}
              disabled={processing}
            >
              {options.t("content_pages:INDEX_ACTION_OPEN_EDITOR")}
            </AntButton>
            <Dropdown trigger={["click"]} menu={{ items: menuItems }}>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                disabled={processing}
                aria-label={options.t("content_pages:INDEX_ACTION_MORE")}
              >
                <MoreVertical className="size-4" />
              </Button>
            </Dropdown>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
