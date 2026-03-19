import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import {
  buildDataTableActionsColumnMeta,
  DataTableActionsCell,
} from "@/components/common/data-table-actions-cell";
import { BaseTag, ContentRuntimeTag, LocaleTagList } from "@/components/ui/tags";
import { ContentLibraryStatusTag } from "./components/content-library-status-tag";
import { ContentLibraryRowActions } from "./components/content-library-row-actions";
import type { ContentLibraryTableRow } from "./types";
import { contentHasAddress } from "./utils";

function ContentLibraryNameCell(props: { row: ContentLibraryTableRow }) {
  const showAddress = contentHasAddress(props.row);

  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">{props.row.name}</div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
        <ContentRuntimeTag runtime={props.row.runtime} />
        {showAddress ? <BaseTag color="blue">/{props.row.slug}</BaseTag> : null}
      </div>
    </div>
  );
}

function ContentLibraryLocaleCell(props: { locale: string }) {
  return <LocaleTagList localeCodes={props.locale} />;
}

export function useContentLibraryTableColumns(params: {
  formatDateTimeOrNull: (value: string | null | undefined) => string | null;
  actionPending: boolean;
  onDuplicate: (row: ContentLibraryTableRow) => void;
  onDelete: (row: ContentLibraryTableRow) => void;
  onArchive: (row: ContentLibraryTableRow) => void;
  onUnarchive: (row: ContentLibraryTableRow) => void;
}) {
  const { t } = useTranslation("content");

  return React.useMemo<ColumnDef<ContentLibraryTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_NAME"), sortKey: "name" },
        header: t("CONTENT_LIBRARY_TABLE_COL_NAME"),
        cell: ({ row }) => <ContentLibraryNameCell row={row.original} />,
        size: 280,
        minSize: 220,
      },
      {
        accessorKey: "derivedStatus",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_STATUS"), sortKey: "derivedStatus" },
        header: t("CONTENT_LIBRARY_TABLE_COL_STATUS"),
        cell: ({ row }) => <ContentLibraryStatusTag status={row.original.derivedStatus} />,
        size: 140,
        minSize: 140,
        maxSize: 140,
      },
      {
        accessorKey: "locale",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_LOCALE") },
        header: t("CONTENT_LIBRARY_TABLE_COL_LOCALE"),
        cell: ({ row }) => <ContentLibraryLocaleCell locale={row.original.locale} />,
        size: 196,
        minSize: 172,
      },
      {
        accessorKey: "updatedAt",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_UPDATED"), sortKey: "updatedAt" },
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
        meta: buildDataTableActionsColumnMeta("center"),
        header: "",
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <DataTableActionsCell align="center">
            <ContentLibraryRowActions
              row={row.original}
              pending={params.actionPending}
              onDuplicate={params.onDuplicate}
              onDelete={params.onDelete}
              onArchive={params.onArchive}
              onUnarchive={params.onUnarchive}
            />
          </DataTableActionsCell>
        ),
        size: 56,
        minSize: 56,
        maxSize: 56,
      },
    ],
    [
      params.actionPending,
      params.formatDateTimeOrNull,
      params.onArchive,
      params.onDelete,
      params.onDuplicate,
      params.onUnarchive,
      t,
    ],
  );
}
