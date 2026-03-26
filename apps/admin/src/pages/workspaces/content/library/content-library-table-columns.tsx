import * as React from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import { ContentLibraryRoleTag } from "./components/content-library-role-tag";
import { ContentLibraryStatusTag } from "./components/content-library-status-tag";
import { ContentLibraryRowActions } from "./components/content-library-row-actions";
import type { ContentLibraryTableRow } from "./types";
import { contentHasAddress } from "./utils";

function ContentLibraryNameCell(props: {
  row: ContentLibraryTableRow;
  pending: boolean;
  onContinue: (row: ContentLibraryTableRow) => void;
  onDuplicate: (row: ContentLibraryTableRow) => void;
  onDelete: (row: ContentLibraryTableRow) => void;
  onArchive: (row: ContentLibraryTableRow) => void;
  onUnarchive: (row: ContentLibraryTableRow) => void;
}) {
  const [actionsHovered, setActionsHovered] = React.useState(false);
  const showAddress = contentHasAddress(props.row);

  return (
    <div
      className="relative min-w-0 pr-32"
      onMouseEnter={() => setActionsHovered(true)}
      onMouseLeave={() => setActionsHovered(false)}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-headline text-label-primary">{props.row.name}</div>
          <ContentLibraryRoleTag role={props.row.role} />
        </div>
        {showAddress ? (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            <BaseTag color="blue">/{props.row.slug}</BaseTag>
          </div>
        ) : null}
      </div>
      <ContentLibraryRowActions
        row={props.row}
        pending={props.pending}
        persistVisible={actionsHovered}
        onContinue={props.onContinue}
        onDuplicate={props.onDuplicate}
        onDelete={props.onDelete}
        onArchive={props.onArchive}
        onUnarchive={props.onUnarchive}
        className="pointer-events-none absolute inset-y-0 right-0 w-30 justify-center opacity-0 transition-opacity duration-150 data-[visible=true]:pointer-events-auto data-[visible=true]:opacity-100"
      />
    </div>
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
  onContinue: (row: ContentLibraryTableRow) => void;
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
        meta: { title: t("CONTENT_LIBRARY_TABLE_COL_NAME"), sortKey: "name", kind: "primary" },
        header: t("CONTENT_LIBRARY_TABLE_COL_NAME"),
        cell: ({ row }) => (
          <ContentLibraryNameCell
            row={row.original}
            pending={params.actionPending}
            onContinue={params.onContinue}
            onDuplicate={params.onDuplicate}
            onDelete={params.onDelete}
            onArchive={params.onArchive}
            onUnarchive={params.onUnarchive}
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
      params.onContinue,
      params.formatDateTimeOrNull,
      params.onArchive,
      params.onDelete,
      params.onDuplicate,
      params.onUnarchive,
      t,
    ],
  );
}
