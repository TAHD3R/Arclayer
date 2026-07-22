import type { ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, Ellipsis, Flag, PlayCircle, XCircle } from "lucide-react";

import type {
  FeedbackListItem,
  FeedbackPriority,
  FeedbackStatus,
  FeedbackUser,
  UpdateFeedbackPayload,
} from "@/api/feedback";
import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { BaseTag } from "@/components/ui/tags";
import { FeedbackUserIdentity } from "@/pages/system/feedback/components/feedback-user-identity";
import {
  FEEDBACK_CONTEXT_LABELS,
  FEEDBACK_INTENT_LABELS,
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUS_LABELS,
} from "@/pages/system/feedback/model";
import { Button } from "@arclayer/ui/button";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

function priorityColor(priority: FeedbackPriority) {
  if (priority === "urgent") return "red" as const;
  if (priority === "high") return "gold" as const;
  return "default" as const;
}

function statusColor(status: FeedbackStatus) {
  if (status === "resolved" || status === "closed") return "green" as const;
  if (status === "in_progress") return "blue" as const;
  if (status === "waiting_for_customer") return "gold" as const;
  return "default" as const;
}

type FeedbackColumnsOptions = {
  t: (key: string, values?: Record<string, unknown>) => string;
  formatDateTime: (value: string) => string;
  updating: boolean;
  onView: (feedbackId: string) => void;
  onQuickUpdate: (feedbackId: string, payload: UpdateFeedbackPayload) => void;
  onFilterReporter: (user: FeedbackUser) => void;
};

export function createFeedbackColumns(
  options: FeedbackColumnsOptions,
): ColumnDef<FeedbackListItem, unknown>[] {
  return [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      meta: { title: "", kind: "select", headerAlign: "center", pin: "left" },
      header: ({ table }) => (
        <div className="flex w-full items-center justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            aria-label={options.t("platform:FEEDBACK_SELECT_ALL")}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(Boolean(checked))}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex w-full items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            aria-label={options.t("platform:FEEDBACK_SELECT_ROW", {
              message: row.original.messagePreview,
            })}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(checked) => row.toggleSelected(Boolean(checked))}
          />
        </div>
      ),
      size: 52,
      minSize: 52,
    },
    {
      id: "message",
      header: options.t("platform:FEEDBACK_COLUMN_MESSAGE"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_MESSAGE"), kind: "primary" },
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="block max-w-full truncate" title={row.original.messagePreview}>
            {row.original.messagePreview}
          </span>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-caption text-label-secondary">
            {row.original.intent ? (
              <BaseTag>
                {options.t(`platform:${FEEDBACK_INTENT_LABELS[row.original.intent]}`)}
              </BaseTag>
            ) : (
              <BaseTag>{options.t("platform:FEEDBACK_LEGACY_MARKER")}</BaseTag>
            )}
            <span className="truncate">{options.formatDateTime(row.original.lastActivityAt)}</span>
          </div>
        </div>
      ),
      size: 320,
      minSize: 240,
    },
    {
      id: "reporter",
      header: options.t("platform:FEEDBACK_COLUMN_REPORTER"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_REPORTER"), kind: "meta" },
      cell: ({ row }) => (
        <FeedbackUserIdentity
          user={row.original.reporter}
          emptyLabel={options.t("platform:FEEDBACK_REPORTER_UNKNOWN")}
          formatDateTime={options.formatDateTime}
          onFilter={options.onFilterReporter}
        />
      ),
      size: 210,
      minSize: 180,
    },
    {
      id: "context",
      header: options.t("platform:FEEDBACK_COLUMN_CONTEXT"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_CONTEXT"), kind: "meta" },
      cell: ({ row }) => (
        <BaseTag>
          {options.t(`platform:${FEEDBACK_CONTEXT_LABELS[row.original.contextType]}`)}
        </BaseTag>
      ),
      size: 130,
    },
    {
      id: "priority",
      header: options.t("platform:FEEDBACK_COLUMN_PRIORITY"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_PRIORITY"), kind: "meta" },
      cell: ({ row }) => (
        <BaseTag color={priorityColor(row.original.priority)}>
          {options.t(`platform:${FEEDBACK_PRIORITY_LABELS[row.original.priority]}`)}
        </BaseTag>
      ),
      size: 110,
    },
    {
      id: "status",
      header: options.t("platform:FEEDBACK_COLUMN_STATUS"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_STATUS"), kind: "meta" },
      cell: ({ row }) => (
        <BaseTag color={statusColor(row.original.status)}>
          {options.t(`platform:${FEEDBACK_STATUS_LABELS[row.original.status]}`)}
        </BaseTag>
      ),
      size: 140,
    },
    {
      id: "assignee",
      header: options.t("platform:FEEDBACK_COLUMN_ASSIGNEE"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_ASSIGNEE"), kind: "meta" },
      cell: ({ row }) => (
        <FeedbackUserIdentity
          user={row.original.assignee}
          emptyLabel={options.t("platform:FEEDBACK_ASSIGNEE_UNASSIGNED")}
          formatDateTime={options.formatDateTime}
        />
      ),
      size: 200,
      minSize: 170,
    },
    {
      id: "lastActivity",
      header: options.t("platform:FEEDBACK_COLUMN_LAST_ACTIVITY"),
      meta: { title: options.t("platform:FEEDBACK_COLUMN_LAST_ACTIVITY"), kind: "meta" },
      cell: ({ row }) => (
        <span className="block truncate">
          {options.formatDateTime(row.original.lastActivityAt)}
        </span>
      ),
      size: 180,
    },
    {
      id: "actions",
      header: "",
      meta: buildDataTableActionsColumnMeta("right", "right"),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <DataTableActionsCell>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => options.onView(row.original.id)}
          >
            {options.t("platform:FEEDBACK_ACTION_DETAILS")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={options.t("platform:FEEDBACK_ACTION_MORE")}
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuIconItem
                icon={<Flag className="size-4" />}
                disabled={options.updating || row.original.priority === "high"}
                onSelect={() => options.onQuickUpdate(row.original.id, { priority: "high" })}
              >
                {options.t("platform:FEEDBACK_ACTION_MARK_HIGH_PRIORITY")}
              </DropdownMenuIconItem>
              <DropdownMenuSeparator />
              <DropdownMenuIconItem
                icon={<PlayCircle className="size-4" />}
                disabled={options.updating || row.original.status === "in_progress"}
                onSelect={() => options.onQuickUpdate(row.original.id, { status: "in_progress" })}
              >
                {options.t("platform:FEEDBACK_ACTION_START")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<CheckCircle2 className="size-4" />}
                disabled={options.updating || row.original.status === "resolved"}
                onSelect={() => options.onQuickUpdate(row.original.id, { status: "resolved" })}
              >
                {options.t("platform:FEEDBACK_ACTION_RESOLVE")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<XCircle className="size-4" />}
                disabled={options.updating || row.original.status === "closed"}
                onSelect={() => options.onQuickUpdate(row.original.id, { status: "closed" })}
              >
                {options.t("platform:FEEDBACK_ACTION_CLOSE")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DataTableActionsCell>
      ),
      size: 188,
      minSize: 176,
    },
  ];
}
