import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { ContentLibraryStatusTag } from "./components/content-library-status-tag";
import { ContentLibraryRowActions } from "./components/content-library-row-actions";
import type { ContentLibraryTableRow } from "./types";

function ContentLibraryNameCell(props: { row: ContentLibraryTableRow }) {
  const { t } = useTranslation("content");

  return (
    <div className="min-w-0">
      <div className="truncate font-medium text-foreground">{props.row.name}</div>
      <div className="truncate text-caption text-label-secondary">
        {[
          props.row.modelName || t("CONTENT_LIBRARY_ROW_UNTYPED"),
          props.row.slug,
          props.row.locale,
        ].join(" · ")}
      </div>
    </div>
  );
}

export function useContentLibraryTableColumns(params: {
  formatDateTimeOrNull: (value: string | null | undefined) => string | null;
  archivePending: boolean;
  onArchive: (row: ContentLibraryTableRow) => void;
}) {
  const { t } = useTranslation("content");

  return React.useMemo<ColumnDef<ContentLibraryTableRow, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_NAME"), sortKey: "name" },
        header: t("CONTENT_LIBRARY_TABLE_COL_NAME"),
        cell: ({ row }) => <ContentLibraryNameCell row={row.original} />,
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
      },
      {
        id: "updatedBy",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_UPDATED_BY") },
        header: t("CONTENT_LIBRARY_TABLE_COL_UPDATED_BY"),
        cell: () => (
          <span className="text-label-secondary">
            {t("CONTENT_LIBRARY_TABLE_UPDATED_BY_UNAVAILABLE")}
          </span>
        ),
      },
      {
        accessorKey: "derivedStatus",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_STATUS"), sortKey: "derivedStatus" },
        header: t("CONTENT_LIBRARY_TABLE_COL_STATUS"),
        cell: ({ row }) => <ContentLibraryStatusTag status={row.original.derivedStatus} />,
      },
      {
        id: "actions",
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_ACTIONS"), kind: "actions" },
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <ContentLibraryRowActions
              row={row.original}
              archivePending={params.archivePending}
              onArchive={params.onArchive}
            />
          </div>
        ),
      },
    ],
    [params.archivePending, params.formatDateTimeOrNull, params.onArchive, t],
  );
}
