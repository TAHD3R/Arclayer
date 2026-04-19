import { useTranslation } from "react-i18next";

import {
  ContentLibraryRuntimeBadgeList,
  ContentLibraryRuntimeDiagnosticList,
} from "./content-library-runtime-badges";
import type { ContentLibraryTableRow } from "../types";

function DetailFact(props: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="text-footnote text-label-secondary">{props.label}</div>
      <div className="text-body text-label-primary">{props.value}</div>
    </div>
  );
}

export function ContentLibraryDetailSummaryStrip(props: {
  row: Pick<
    ContentLibraryTableRow,
    | "bootstrapPresetState"
    | "derivedStatus"
    | "draftVersion"
    | "name"
    | "publishedVersion"
    | "shapeState"
    | "slug"
    | "summary"
    | "visibility"
  >;
}) {
  const { t } = useTranslation("content");

  return (
    <div
      data-testid="content-library-detail-summary-strip"
      className="grid gap-4 rounded-xl border border-border/70 bg-card px-4 py-4"
    >
      <div className="grid gap-2">
        <div className="text-title text-label-primary">{props.row.name}</div>
        <div className="text-body text-label-secondary">
          {props.row.summary?.trim() || t("CONTENT_LIBRARY_PREVIEW_SUMMARY_EMPTY_STRUCTURED")}
        </div>
        <div className="flex flex-wrap gap-2">
          <ContentLibraryRuntimeBadgeList row={props.row} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DetailFact
          label={t("CONTENT_LIBRARY_PREVIEW_FIELD_PERMALINK")}
          value={`/${props.row.slug}`}
        />
        <DetailFact
          label={t("CONTENT_LIBRARY_PREVIEW_FIELD_STATUS")}
          value={t(`CONTENT_LIBRARY_STATUS_${props.row.derivedStatus.toUpperCase()}`)}
        />
        <DetailFact
          label={t("CONTENT_LIBRARY_PREVIEW_FIELD_VISIBILITY")}
          value={t(`CONTENT_LIBRARY_VISIBILITY_${props.row.visibility.toUpperCase()}`)}
        />
        <div className="grid gap-1.5 md:col-span-2">
          <div className="text-footnote text-label-secondary">
            {t("CONTENT_LIBRARY_PREVIEW_FIELD_DIAGNOSTICS")}
          </div>
          <div className="flex flex-wrap gap-2">
            <ContentLibraryRuntimeDiagnosticList row={props.row} />
          </div>
        </div>
      </div>
    </div>
  );
}
