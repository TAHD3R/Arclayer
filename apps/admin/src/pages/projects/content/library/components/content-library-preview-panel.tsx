import { Blocks, FolderTree, LayoutTemplate } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@arclayer/ui/card";
import { Button } from "@arclayer/ui/button";
import { cn } from "@arclayer/lib/utils";
import {
  getContentTypeDescription,
  getContentTypeLabel,
} from "@/pages/projects/content/content-type-presentation";

import { ContentLibraryRuntimeDiagnosticList } from "./content-library-runtime-badges";
import { ContentLibraryDetailSummaryStrip } from "./content-library-detail-summary-strip";
import type { ContentLibraryTableRow } from "../types";
import { ContentLibraryArticleEditorShell } from "../article-editor/components/content-library-article-editor-shell";
import { useContentLibraryArticleEditor } from "../article-editor/hooks/use-content-library-article-editor";
import { isContentLibraryReusableSectionRow } from "../utils";

function ContentLibrarySummaryPreview(props: {
  icon: "page" | "reusable" | "structured";
  row: ContentLibraryTableRow;
  title: string;
  description: string;
  readOnly?: boolean;
  onEditPermalink?: () => void;
  onEditSeo?: () => void;
  onEditVisibility?: () => void;
  onOpenPageSettings?: () => void;
  onOpenStructuredFields?: () => void;
  className?: string;
}) {
  const { t } = useTranslation("content");
  const Icon =
    props.icon === "page" ? LayoutTemplate : props.icon === "reusable" ? Blocks : FolderTree;
  const summary =
    props.row.summary?.trim() ||
    (props.icon === "page"
      ? t("CONTENT_LIBRARY_ROW_SUMMARY_EMPTY_PAGE")
      : props.icon === "reusable"
        ? t("CONTENT_LIBRARY_PREVIEW_SUMMARY_EMPTY_REUSABLE")
        : t("CONTENT_LIBRARY_PREVIEW_SUMMARY_EMPTY_STRUCTURED"));

  return (
    <aside
      data-slot="content-library-preview-panel"
      className={cn("flex h-full min-h-0 w-full flex-col overflow-auto bg-card", props.className)}
      aria-label={t("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")}
    >
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 px-4 md:px-5">
        <span className="inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-muted/40 text-label-secondary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-label-primary">{props.title}</div>
          <div className="text-footnote text-label-secondary">{props.description}</div>
        </div>
      </div>

      <div className="grid gap-4 p-4 md:p-5">
        <ContentLibraryDetailSummaryStrip
          row={{
            ...props.row,
            summary,
          }}
        />

        <Card>
          <CardHeader>
            <CardTitle>{t("CONTENT_LIBRARY_PREVIEW_DIAGNOSTICS_TITLE")}</CardTitle>
            <CardDescription>{t("CONTENT_LIBRARY_PREVIEW_DIAGNOSTICS_DESC")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <div className="text-footnote text-label-secondary">
                {t("CONTENT_LIBRARY_PREVIEW_FIELD_CONTENT_TYPE")}
              </div>
              <div className="text-body text-label-primary">{props.title}</div>
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <div className="text-footnote text-label-secondary">
                {t("CONTENT_LIBRARY_PREVIEW_FIELD_DIAGNOSTICS")}
              </div>
              <div className="flex flex-wrap gap-2">
                <ContentLibraryRuntimeDiagnosticList row={props.row} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {props.icon === "page"
                ? t("CONTENT_LIBRARY_PREVIEW_PAGE_NEXT_TITLE")
                : props.icon === "reusable"
                  ? t("CONTENT_LIBRARY_PREVIEW_REUSABLE_NEXT_TITLE")
                  : t("CONTENT_LIBRARY_PREVIEW_STRUCTURED_NEXT_TITLE")}
            </CardTitle>
            <CardDescription>
              {props.icon === "page"
                ? t("CONTENT_LIBRARY_PREVIEW_PAGE_NEXT_DESC")
                : props.icon === "reusable"
                  ? t("CONTENT_LIBRARY_PREVIEW_REUSABLE_NEXT_DESC")
                  : t("CONTENT_LIBRARY_PREVIEW_STRUCTURED_NEXT_DESC")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {props.onEditPermalink ? (
              <Button
                type="button"
                variant="outline"
                onClick={props.onEditPermalink}
                disabled={props.readOnly}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_PERMALINK")}
              </Button>
            ) : null}
            {props.onEditSeo ? (
              <Button
                type="button"
                variant="outline"
                onClick={props.onEditSeo}
                disabled={props.readOnly}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_SEO")}
              </Button>
            ) : null}
            {props.onEditVisibility ? (
              <Button
                type="button"
                variant="outline"
                onClick={props.onEditVisibility}
                disabled={props.readOnly}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_VISIBILITY")}
              </Button>
            ) : null}
            {props.icon === "page" && props.onOpenPageSettings ? (
              <Button type="button" onClick={props.onOpenPageSettings} disabled={props.readOnly}>
                {t("CONTENT_LIBRARY_ACTION_PAGE_SETTINGS")}
              </Button>
            ) : null}
            {props.icon !== "page" && props.onOpenStructuredFields ? (
              <Button
                type="button"
                onClick={props.onOpenStructuredFields}
                disabled={props.readOnly}
              >
                {t("CONTENT_LIBRARY_ACTION_EDIT_FIELDS")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}

function ContentLibraryArticlePreview(props: {
  projectId: string;
  row: ContentLibraryTableRow;
  initialTitle?: string;
  initialSummary?: string;
  onClose: () => void;
  onOpenPage: () => void;
  className?: string;
}) {
  const { t } = useTranslation("content");
  const editor = useContentLibraryArticleEditor({
    projectId: props.projectId,
    itemId: props.row.id,
    initialTitle: props.initialTitle,
    initialSummary: props.initialSummary,
  });

  return (
    <aside
      data-slot="content-library-preview-panel"
      className={cn("flex h-full min-h-0 w-full flex-col overflow-hidden", props.className)}
      aria-label={t("CONTENT_LIBRARY_PREVIEW_PANEL_TITLE")}
    >
      <ContentLibraryArticleEditorShell
        projectId={props.projectId}
        itemId={props.row.id}
        mode="split"
        title={editor.title}
        summary={editor.summary}
        onTitleChange={editor.setTitle}
        onSummaryChange={editor.setSummary}
        slug={editor.slug}
        onSlugChange={editor.setSlug}
        status={editor.status}
        visibility={editor.visibility}
        onVisibilityChange={editor.setVisibility}
        coverAssetId={editor.coverAssetId}
        onCoverAssetIdChange={editor.setCoverAssetId}
        seo={editor.seo}
        onSeoChange={editor.setSeo}
        bodyDocument={editor.bodyDocument}
        onBodyDocumentChange={editor.setBodyDocument}
        isLoading={editor.isLoading}
        runtime={editor.runtime}
        onPublish={editor.publish}
        onClose={props.onClose}
        onOpenPage={props.onOpenPage}
        className="h-full"
      />
    </aside>
  );
}

export function ContentLibraryPreviewPanel(props: {
  projectId: string;
  row: ContentLibraryTableRow;
  initialTitle?: string;
  initialSummary?: string;
  readOnly?: boolean;
  onClose: () => void;
  onOpenPage: () => void;
  onEditPermalink?: () => void;
  onEditSeo?: () => void;
  onEditVisibility?: () => void;
  onOpenPageSettings?: () => void;
  onOpenStructuredFields?: () => void;
  className?: string;
}) {
  const { t } = useTranslation("content");
  const contentTypeTitle = getContentTypeLabel({
    modelKey: props.row.modelKey,
    fallbackName: props.row.modelName,
    fallbackLabel: props.row.role ?? props.row.modelKey ?? props.row.name,
    t,
  });
  const contentTypeDescription =
    getContentTypeDescription({
      modelKey: props.row.modelKey,
      fallbackDescription: props.row.modelDescription,
      t,
    }) ?? t("CONTENT_TYPE_CATEGORY_DESC");

  if (isContentLibraryReusableSectionRow(props.row)) {
    return (
      <ContentLibrarySummaryPreview
        icon="reusable"
        row={props.row}
        title={contentTypeTitle}
        description={contentTypeDescription}
        readOnly={props.readOnly}
        onEditVisibility={props.onEditVisibility}
        onOpenStructuredFields={props.onOpenStructuredFields}
        className={props.className}
      />
    );
  }

  if (props.row.editWith === "canvas" || props.row.role === "page") {
    return (
      <ContentLibrarySummaryPreview
        icon="page"
        row={props.row}
        title={contentTypeTitle}
        description={contentTypeDescription}
        readOnly={props.readOnly}
        onEditPermalink={props.onEditPermalink}
        onEditSeo={props.onEditSeo}
        onEditVisibility={props.onEditVisibility}
        onOpenPageSettings={props.onOpenPageSettings}
        className={props.className}
      />
    );
  }

  if (props.row.editWith === "structured") {
    return (
      <ContentLibrarySummaryPreview
        icon="structured"
        row={props.row}
        title={contentTypeTitle}
        description={contentTypeDescription}
        readOnly={props.readOnly}
        onEditVisibility={props.onEditVisibility}
        onOpenStructuredFields={props.onOpenStructuredFields}
        className={props.className}
      />
    );
  }

  return <ContentLibraryArticlePreview {...props} />;
}
