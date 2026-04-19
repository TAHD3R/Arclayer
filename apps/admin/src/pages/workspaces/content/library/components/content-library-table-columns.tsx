import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@arclayer/ui/tooltip";
import { BaseTag } from "@/components/ui/tags";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  getContentLibraryRoleIcon,
  getContentLibraryRoleLabelKey,
} from "./content-library-role-tag";
import {
  ContentLibraryRuntimeBadgeList,
  ContentLibraryRuntimeDiagnosticList,
} from "./content-library-runtime-badges";
import { ContentLibraryRowActions } from "./content-library-row-actions";
import type { ContentLibraryTableRow } from "../types";
import { contentHasAddress } from "../utils";
import {
  getContentTypeLabel,
  getOfficialContentTypePresentation,
} from "../../content-type-presentation";

function ContentLibraryNameCell(props: { row: ContentLibraryTableRow }) {
  const showAddress = contentHasAddress(props.row);
  const { t } = useTranslation("content");
  const role = props.row.role;
  const RoleIcon = role ? getContentLibraryRoleIcon(role) : null;
  const roleLabelKey = role ? getContentLibraryRoleLabelKey(role) : null;
  const summary = props.row.summary?.trim();
  const fallbackSummary =
    role === "article"
      ? t("CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_ARTICLE")
      : role === "page"
        ? t("CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_PAGE")
        : null;
  const summaryText = summary || fallbackSummary;

  return (
    <div className="min-w-0">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          {RoleIcon && roleLabelKey ? (
            <span
              className="inline-flex shrink-0 text-label-secondary"
              title={t(roleLabelKey)}
              aria-label={t(roleLabelKey)}
            >
              <RoleIcon className="size-4" />
            </span>
          ) : null}
          <OverflowTooltipText className="min-w-0 flex-1 truncate text-headline text-label-primary">
            {props.row.name}
          </OverflowTooltipText>
        </div>
        {showAddress ? (
          <div className="mt-1 min-w-0 truncate text-footnote text-label-secondary">
            /{props.row.slug}
          </div>
        ) : null}
        {summaryText ? (
          <OverflowTooltipText className="mt-1 min-w-0 truncate text-footnote text-label-secondary/90">
            {summaryText}
          </OverflowTooltipText>
        ) : null}
      </div>
    </div>
  );
}

function OverflowTooltipText(props: { className?: string; children: string }) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);

  React.useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const update = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    };

    update();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [props.children]);

  const content = (
    <div ref={contentRef} className={props.className}>
      {props.children}
    </div>
  );

  if (!isOverflowing) return content;

  return (
    <TooltipProvider>
      <Tooltip side="top">
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent className="max-w-[28rem]">{props.children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ContentLibraryContentTypeCell(props: {
  row: ContentLibraryTableRow;
  untypedLabel: string;
}) {
  const { t } = useTranslation("content");
  const presentation = getOfficialContentTypePresentation(props.row.modelKey);
  const Icon = presentation?.icon;
  const label = getContentTypeLabel({
    modelKey: props.row.modelKey,
    fallbackName: props.row.modelName,
    fallbackLabel: props.untypedLabel,
    t,
  });

  return (
    <span className="inline-flex items-center gap-2 text-body text-label-primary">
      {Icon ? <Icon className="size-4 text-label-secondary" aria-hidden="true" /> : null}
      <span>{label}</span>
    </span>
  );
}

function ContentLibraryGroupCell(props: { row: ContentLibraryTableRow; label: string }) {
  return <BaseTag color="blue">{props.label}</BaseTag>;
}

function ContentLibraryDiagnosticsCell(props: { row: ContentLibraryTableRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <ContentLibraryRuntimeDiagnosticList row={props.row} />
    </div>
  );
}

function ContentLibraryWorkflowCell(props: { row: ContentLibraryTableRow }) {
  const { t } = useTranslation("content");
  const stage = props.row.workflowStage ?? "drafting";
  const ready = props.row.publishReadiness?.ready === true;
  const blockerCodes = props.row.publishReadiness?.blockerCodes ?? [];
  const tone = ready ? "green" : stage === "approved" ? "blue" : "gold";

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <BaseTag color={tone}>{t(`CONTENT_LIBRARY_WORKFLOW_STAGE_${stage.toUpperCase()}`)}</BaseTag>
        {ready ? (
          <span className="text-footnote text-label-secondary">
            {t("CONTENT_LIBRARY_WORKFLOW_READY")}
          </span>
        ) : null}
      </div>
      {blockerCodes.length > 0 ? (
        <div className="truncate text-footnote text-label-secondary">
          {t("CONTENT_LIBRARY_WORKFLOW_BLOCKED_BY", { count: blockerCodes.length })}
        </div>
      ) : props.row.workflowSummary ? (
        <div className="truncate text-footnote text-label-secondary">
          {props.row.workflowSummary}
        </div>
      ) : null}
    </div>
  );
}

export function useContentLibraryTableColumns(params: {
  formatDateTimeOrNull: (value: string | null | undefined) => string | null;
  actionPending: boolean;
  canManageContent?: boolean;
  selectedRowIds: ReadonlySet<string>;
  onToggleVisibleRows: (rows: ContentLibraryTableRow[], selected: boolean) => void;
  onToggleRowSelection: (row: ContentLibraryTableRow) => void;
  onOpen: (row: ContentLibraryTableRow) => void;
  onOpenFullEditor?: (row: ContentLibraryTableRow) => void;
  onEditPermalink?: (row: ContentLibraryTableRow) => void;
  onEditSeo?: (row: ContentLibraryTableRow) => void;
  onEditVisibility?: (row: ContentLibraryTableRow) => void;
  onOpenPageSettings?: (row: ContentLibraryTableRow) => void;
  onOpenStructuredFields?: (row: ContentLibraryTableRow) => void;
  onDuplicate: (row: ContentLibraryTableRow) => void;
  onDelete: (row: ContentLibraryTableRow) => void;
  onArchive: (row: ContentLibraryTableRow) => void;
  onUnarchive: (row: ContentLibraryTableRow) => void;
  openPreviewRowId?: string | null;
}) {
  const { t } = useTranslation(["content", "common"]);

  return React.useMemo<ColumnDef<ContentLibraryTableRow, unknown>[]>(
    () => [
      {
        id: "select",
        enableHiding: false,
        enableSorting: false,
        size: 52,
        minSize: 52,
        maxSize: 52,
        meta: { title: "", kind: "select", headerAlign: "center" },
        header: ({ table }) => {
          const visibleRows = table.getRowModel().rows.map((entry) => entry.original);
          const allVisibleSelected =
            visibleRows.length > 0 && visibleRows.every((row) => params.selectedRowIds.has(row.id));
          return (
            <div className="flex w-full items-center justify-center">
              <Checkbox
                checked={allVisibleSelected}
                aria-label={t("common:SELECT_ALL") || "Select all"}
                onCheckedChange={() => params.onToggleVisibleRows(visibleRows, allVisibleSelected)}
              />
            </div>
          );
        },
        cell: ({ row }) => (
          <div className="flex w-full items-center justify-center">
            <Checkbox
              checked={params.selectedRowIds.has(row.original.id)}
              aria-label={t("common:SELECT") || "Select"}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onCheckedChange={() => params.onToggleRowSelection(row.original)}
            />
          </div>
        ),
      },
      {
        accessorKey: "name",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_NAME"), sortKey: "name", kind: "primary" },
        header: t("CONTENT_LIBRARY_TABLE_COL_NAME"),
        cell: ({ row }) => <ContentLibraryNameCell row={row.original} />,
        size: 360,
        minSize: 300,
      },
      {
        accessorKey: "modelName",
        meta: {
          title: t("CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE"),
          sortKey: "modelName",
          kind: "meta",
        },
        header: t("CONTENT_LIBRARY_TABLE_COL_CONTENT_TYPE"),
        cell: ({ row }) => (
          <ContentLibraryContentTypeCell
            row={row.original}
            untypedLabel={t("CONTENT_LIBRARY_ROW_UNTYPED")}
          />
        ),
        size: 210,
        minSize: 180,
      },
      {
        accessorKey: "libraryGroup",
        meta: {
          title: t("CONTENT_LIBRARY_TABLE_COL_LIBRARY_GROUP"),
          kind: "meta",
          defaultHidden: true,
        },
        header: t("CONTENT_LIBRARY_TABLE_COL_LIBRARY_GROUP"),
        cell: ({ row }) => {
          const label =
            row.original.libraryGroup === "site-content"
              ? t("CONTENT_LIBRARY_GROUP_SITE_CONTENT")
              : row.original.libraryGroup === "structured-content"
                ? t("CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT")
                : t("CONTENT_LIBRARY_GROUP_GENERAL_CONTENT");
          return <ContentLibraryGroupCell row={row.original} label={label} />;
        },
        size: 188,
        minSize: 168,
      },
      {
        accessorKey: "derivedStatus",
        meta: {
          title: t("CONTENT_LIBRARY_TABLE_COL_STATUS"),
          sortKey: "derivedStatus",
          kind: "status",
        },
        header: t("CONTENT_LIBRARY_TABLE_COL_STATUS"),
        cell: ({ row }) => <ContentLibraryRuntimeBadgeList row={row.original} />,
        size: 250,
        minSize: 220,
      },
      {
        accessorKey: "workflowStage",
        meta: {
          title: t("CONTENT_LIBRARY_TABLE_COL_WORKFLOW"),
          kind: "meta",
        },
        header: t("CONTENT_LIBRARY_TABLE_COL_WORKFLOW"),
        cell: ({ row }) => <ContentLibraryWorkflowCell row={row.original} />,
        size: 230,
        minSize: 200,
      },
      {
        id: "diagnostics",
        meta: {
          title: t("CONTENT_LIBRARY_TABLE_COL_DIAGNOSTICS"),
          kind: "meta",
          defaultHidden: true,
        },
        header: t("CONTENT_LIBRARY_TABLE_COL_DIAGNOSTICS"),
        cell: ({ row }) => <ContentLibraryDiagnosticsCell row={row.original} />,
        size: 260,
        minSize: 220,
      },
      {
        accessorKey: "updatedAt",
        meta: {
          title: t("CONTENT_LIBRARY_TABLE_COL_UPDATED"),
          sortKey: "updatedAt",
          kind: "time",
        },
        header: t("CONTENT_LIBRARY_TABLE_COL_UPDATED"),
        cell: ({ row }) => {
          const formatted = params.formatDateTimeOrNull(row.original.updatedAt);
          return (
            <span className={formatted ? "" : "text-label-secondary"}>
              {formatted || row.original.updatedAt}
            </span>
          );
        },
        size: 180,
        minSize: 160,
      },
      {
        id: "actions",
        enableHiding: false,
        enableSorting: false,
        meta: buildDataTableActionsColumnMeta("right"),
        header: "",
        cell: ({ row }) => (
          <DataTableActionsCell>
            <ContentLibraryRowActions
              row={row.original}
              canManageContent={params.canManageContent}
              pending={params.actionPending}
              previewOpen={params.openPreviewRowId === row.original.id}
              onOpen={params.onOpen}
              onOpenFullEditor={params.onOpenFullEditor}
              onEditPermalink={params.onEditPermalink}
              onEditSeo={params.onEditSeo}
              onEditVisibility={params.onEditVisibility}
              onOpenPageSettings={params.onOpenPageSettings}
              onOpenStructuredFields={params.onOpenStructuredFields}
              onDuplicate={params.onDuplicate}
              onDelete={params.onDelete}
              onArchive={params.onArchive}
              onUnarchive={params.onUnarchive}
            />
          </DataTableActionsCell>
        ),
        size: 124,
        minSize: 124,
        maxSize: 124,
      },
    ],
    [
      params.actionPending,
      params.canManageContent,
      params.onOpen,
      params.onOpenFullEditor,
      params.onEditPermalink,
      params.onEditSeo,
      params.onEditVisibility,
      params.onOpenPageSettings,
      params.onOpenStructuredFields,
      params.formatDateTimeOrNull,
      params.onArchive,
      params.onDelete,
      params.onDuplicate,
      params.onToggleVisibleRows,
      params.onToggleRowSelection,
      params.onUnarchive,
      params.openPreviewRowId,
      params.selectedRowIds,
      t,
    ],
  );
}
