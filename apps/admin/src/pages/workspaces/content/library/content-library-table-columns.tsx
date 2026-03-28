import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BaseTag } from "@/components/ui/tags";
import { Checkbox } from "@arclayer/ui/checkbox";
import {
  getContentLibraryRoleIcon,
  getContentLibraryRoleLabelKey,
} from "./components/content-library-role-tag";
import { ContentLibraryStatusTag } from "./components/content-library-status-tag";
import { ContentLibraryRowActions } from "./components/content-library-row-actions";
import type { ContentLibraryTableRow } from "./types";
import { contentHasAddress } from "./utils";

function ContentLibraryNameCell(props: {
  row: ContentLibraryTableRow;
  pending: boolean;
  onOpen: (row: ContentLibraryTableRow) => void;
  onDuplicate: (row: ContentLibraryTableRow) => void;
  onDelete: (row: ContentLibraryTableRow) => void;
  onArchive: (row: ContentLibraryTableRow) => void;
  onUnarchive: (row: ContentLibraryTableRow) => void;
  previewOpen?: boolean;
}) {
  const [actionsHovered, setActionsHovered] = React.useState(false);
  const showAddress = contentHasAddress(props.row);
  const RoleIcon = getContentLibraryRoleIcon(props.row.role);
  const roleLabelKey = getContentLibraryRoleLabelKey(props.row.role);
  const { t } = useTranslation("content");
  const summary = props.row.summary?.trim();
  const fallbackSummary =
    props.row.role === "article"
      ? t("CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_ARTICLE")
      : props.row.role === "page"
        ? t("CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_PAGE")
        : null;
  const summaryText = summary || fallbackSummary;

  return (
    <div
      className="relative min-w-0 pr-32"
      onMouseEnter={() => setActionsHovered(true)}
      onMouseLeave={() => setActionsHovered(false)}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex shrink-0 text-label-secondary"
            title={t(roleLabelKey)}
            aria-label={t(roleLabelKey)}
          >
            <RoleIcon className="size-4" />
          </span>
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
      <ContentLibraryRowActions
        row={props.row}
        pending={props.pending}
        persistVisible={actionsHovered}
        previewOpen={props.previewOpen}
        onOpen={props.onOpen}
        onDuplicate={props.onDuplicate}
        onDelete={props.onDelete}
        onArchive={props.onArchive}
        onUnarchive={props.onUnarchive}
        className="pointer-events-none absolute inset-y-0 right-0 w-30 justify-center opacity-0 transition-opacity duration-150 data-[visible=true]:pointer-events-auto data-[visible=true]:opacity-100"
      />
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

function ContentLibraryModelCell(props: { row: ContentLibraryTableRow; untypedLabel: string }) {
  return (
    <span className="text-body text-label-primary">
      {props.row.modelName || props.untypedLabel}
    </span>
  );
}

function ContentLibraryGroupCell(props: { row: ContentLibraryTableRow; label: string }) {
  return <BaseTag color="blue">{props.label}</BaseTag>;
}

export function useContentLibraryTableColumns(params: {
  formatDateTimeOrNull: (value: string | null | undefined) => string | null;
  actionPending: boolean;
  selectedRowIds: ReadonlySet<string>;
  onToggleVisibleRows: (rows: ContentLibraryTableRow[], selected: boolean) => void;
  onToggleRowSelection: (row: ContentLibraryTableRow) => void;
  onOpen: (row: ContentLibraryTableRow) => void;
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
        cell: ({ row }) => (
          <ContentLibraryNameCell
            row={row.original}
            pending={params.actionPending}
            onOpen={params.onOpen}
            onDuplicate={params.onDuplicate}
            onDelete={params.onDelete}
            onArchive={params.onArchive}
            onUnarchive={params.onUnarchive}
            previewOpen={params.openPreviewRowId === row.original.id}
          />
        ),
        size: 360,
        minSize: 300,
      },
      {
        accessorKey: "modelName",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_MODEL"), sortKey: "modelName", kind: "meta" },
        header: t("CONTENT_LIBRARY_TABLE_COL_MODEL"),
        cell: ({ row }) => (
          <ContentLibraryModelCell
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
        cell: ({ row }) => <ContentLibraryStatusTag status={row.original.derivedStatus} />,
        size: 140,
        minSize: 140,
        maxSize: 140,
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
    ],
    [
      params.actionPending,
      params.onOpen,
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
