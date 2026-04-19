import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { BaseTag } from "@/components/ui/tags";
import { cn } from "@arclayer/lib/utils";

import { ContentLibraryEditWithTag } from "./content-library-edit-with-tag";
import {
  ContentLibraryRuntimeBadgeList,
  ContentLibraryRuntimeDiagnosticList,
} from "./content-library-runtime-badges";
import { ContentLibraryRoleTag } from "./content-library-role-tag";
import { ContentLibraryRowActions } from "./content-library-row-actions";
import type { ContentLibraryTableRow } from "../types";
import { getContentTypeLabel } from "../../content-type-presentation";

function getLibraryGroupLabelKey(row: ContentLibraryTableRow) {
  if (row.libraryGroup === "site-content") return "CONTENT_LIBRARY_GROUP_SITE_CONTENT";
  if (row.libraryGroup === "structured-content") {
    return "CONTENT_LIBRARY_GROUP_STRUCTURED_CONTENT";
  }
  return "CONTENT_LIBRARY_GROUP_GENERAL_CONTENT";
}

type ContentLibraryCardListProps = {
  rows: ContentLibraryTableRow[];
  previewRowId?: string | null;
  onCardClick: (row: ContentLibraryTableRow) => void;
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
  formatDateTimeOrNull: (value: string | null | undefined) => string | null;
  pending?: boolean;
};

export function ContentLibraryCardList(props: ContentLibraryCardListProps) {
  const { t } = useTranslation("content");

  return (
    <div
      data-testid="content-library-card-list"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      {props.rows.map((row) => (
        <div
          key={row.id}
          role="button"
          tabIndex={0}
          className={cn(
            "col-span-1 flex cursor-pointer flex-col rounded-lg border border-border bg-card! p-4 !",
            "transition-colors! duration-200!",
            "hover:border-border/80! hover:bg-accent/50! hover:!",
          )}
          onClick={() => props.onCardClick(row)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              props.onCardClick(row);
            }
          }}
          aria-label={row.name}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-headline text-label-primary">{row.name}</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {row.role ? <ContentLibraryRoleTag role={row.role} /> : null}
                {row.editWith ? <ContentLibraryEditWithTag editWith={row.editWith} /> : null}
                <BaseTag>
                  {getContentTypeLabel({
                    modelKey: row.modelKey,
                    fallbackName: row.modelName,
                    fallbackLabel: t("CONTENT_LIBRARY_ROW_UNTYPED"),
                    t,
                  })}
                </BaseTag>
              </div>
            </div>
            <div
              className="shrink-0"
              onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
            >
              <ContentLibraryRowActions
                row={row}
                pending={props.pending}
                previewOpen={props.previewRowId === row.id}
                onOpen={props.onOpen}
                onOpenFullEditor={props.onOpenFullEditor}
                onEditPermalink={props.onEditPermalink}
                onEditSeo={props.onEditSeo}
                onEditVisibility={props.onEditVisibility}
                onOpenPageSettings={props.onOpenPageSettings}
                onOpenStructuredFields={props.onOpenStructuredFields}
                onDuplicate={props.onDuplicate}
                onDelete={props.onDelete}
                onArchive={props.onArchive}
                onUnarchive={props.onUnarchive}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ContentLibraryRuntimeBadgeList row={row} />
              <BaseTag color="blue">{t(getLibraryGroupLabelKey(row))}</BaseTag>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ContentLibraryRuntimeDiagnosticList row={row} />
            </div>
            <div className="text-footnote text-label-secondary">
              {t("CONTENT_LIBRARY_FIELD_UPDATED")}:{" "}
              {props.formatDateTimeOrNull(row.updatedAt) || row.updatedAt}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
