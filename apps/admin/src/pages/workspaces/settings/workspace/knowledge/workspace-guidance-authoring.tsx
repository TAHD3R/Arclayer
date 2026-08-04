import { useMemo } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { KnowledgeGuidanceRevisionOut } from "@arclayer/openapi";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@arclayer/ui/accordion";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";

import type { WorkspaceGuidanceController } from "./use-workspace-guidance-controller";

export function WorkspaceKnowledgeEditor({
  controller,
}: {
  controller: WorkspaceGuidanceController;
}) {
  const { t } = useTranslation("knowledge");
  const layer = controller.layer!;

  return (
    <section aria-labelledby="workspace-knowledge-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="workspace-knowledge-title" className="text-title2 font-bold text-label-primary">
            {t("EDITOR_TITLE")}
          </h2>
          <p id="workspace-knowledge-description" className="mt-1 text-body text-label-secondary">
            {t("EDITOR_DESCRIPTION")}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          {controller.hasUnsavedChanges || controller.saveDraftMutation.isPending ? (
            <Button
              variant="outline"
              disabled={
                !controller.draft.trim() ||
                controller.saveDraftMutation.isPending ||
                controller.publishMutation.isPending
              }
              loading={controller.saveDraftMutation.isPending}
              onClick={() => void controller.saveDraft()}
            >
              {t("SAVE_DRAFT")}
            </Button>
          ) : null}
          <Button
            disabled={
              !layer.currentDraft?.id ||
              controller.hasUnsavedChanges ||
              controller.saveDraftMutation.isPending ||
              controller.publishMutation.isPending
            }
            loading={controller.publishMutation.isPending}
            onClick={() => void controller.publish()}
          >
            {t("PUBLISH_ACTION")}
          </Button>
        </div>
      </div>

      {layer.removedAt ? <RemovedGuidanceAlert isProject={false} /> : null}

      <label htmlFor="workspace-guidance-content" className="sr-only">
        {t("EDITOR_FIELD_LABEL")}
      </label>
      <Textarea
        id="workspace-guidance-content"
        aria-describedby="workspace-knowledge-description"
        className="mt-6 min-h-[32rem] resize-y px-4 py-3 text-body leading-7"
        disabled={controller.saveDraftMutation.isPending || controller.publishMutation.isPending}
        value={controller.draft}
        onChange={(event) => controller.setDraft(event.target.value)}
        placeholder={t("EDITOR_PLACEHOLDER")}
      />

      <section className="mt-6" aria-labelledby="workspace-knowledge-faq-title">
        <h3 id="workspace-knowledge-faq-title" className="text-headline text-label-primary">
          {t("EDITOR_FAQ_TITLE")}
        </h3>
        <p className="mt-1 text-footnote text-label-secondary">{t("EDITOR_FAQ_DESCRIPTION")}</p>
        <Accordion type="single" collapsible className="mt-3 rounded-xl border px-4 sm:px-5">
          <AccordionItem value="business">
            <AccordionTrigger>{t("EDITOR_FAQ_BUSINESS_QUESTION")}</AccordionTrigger>
            <AccordionContent className="leading-6 text-label-secondary">
              {t("EDITOR_FAQ_BUSINESS_ANSWER")}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="voice">
            <AccordionTrigger>{t("EDITOR_FAQ_VOICE_QUESTION")}</AccordionTrigger>
            <AccordionContent className="leading-6 text-label-secondary">
              {t("EDITOR_FAQ_VOICE_ANSWER")}
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="rules">
            <AccordionTrigger>{t("EDITOR_FAQ_RULES_QUESTION")}</AccordionTrigger>
            <AccordionContent className="leading-6 text-label-secondary">
              {t("EDITOR_FAQ_RULES_ANSWER")}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>
    </section>
  );
}

export function GuidanceEditor({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const layer = controller.layer!;
  const currentRevision = layer.currentDraft ?? layer.currentPublished ?? null;
  const hasContent = Boolean(currentRevision?.content);

  return (
    <section
      className="overflow-hidden rounded-xl border bg-card"
      aria-labelledby="guidance-editor-title"
    >
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="guidance-editor-title" className="text-title2 font-bold text-label-primary">
            {t(controller.isProject ? "PROJECT_EDITOR_TITLE" : "EDITOR_TITLE")}
          </h2>
          {currentRevision ? <RevisionStatusBadge status={currentRevision.status} /> : null}
        </div>
        <p className="mt-2 max-w-3xl text-footnote leading-6 text-label-secondary">
          {t(controller.isProject ? "PROJECT_EDITOR_DESCRIPTION" : "EDITOR_DESCRIPTION")}
        </p>

        {layer.removedAt ? <RemovedGuidanceAlert isProject={controller.isProject} /> : null}

        <div className="mt-6">
          <label htmlFor="workspace-guidance-content" className="text-headline text-label-primary">
            {t("EDITOR_FIELD_LABEL")}
          </label>
          <p id="workspace-guidance-help" className="mt-1 text-caption text-label-secondary">
            {t("EDITOR_HELP")}
          </p>
          <Textarea
            id="workspace-guidance-content"
            aria-describedby="workspace-guidance-help"
            className="mt-3 min-h-[26rem] resize-y text-body leading-7"
            disabled={
              controller.saveDraftMutation.isPending || controller.publishMutation.isPending
            }
            value={controller.draft}
            onChange={(event) => controller.setDraft(event.target.value)}
            placeholder={t("EDITOR_PLACEHOLDER")}
          />
        </div>

        {controller.isProject ? <ProjectGuidanceMode controller={controller} /> : null}
      </div>

      <div className="flex flex-col gap-4 border-t bg-muted/20 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-caption text-label-secondary" aria-live="polite">
            {currentRevision
              ? t("REVISION_DETAIL", { revision: currentRevision.revisionNumber })
              : t("NO_REVISION_YET")}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={
              !hasContent || Boolean(layer.removedAt) || controller.removePreviewMutation.isPending
            }
            loading={controller.removePreviewMutation.isPending}
            onClick={() => void controller.previewRemoval()}
          >
            <Trash2 data-icon="inline-start" />
            {t("REMOVE_ACTION")}
          </Button>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {controller.hasUnsavedChanges || controller.saveDraftMutation.isPending ? (
            <Button
              variant="outline"
              disabled={
                !controller.draft.trim() ||
                controller.saveDraftMutation.isPending ||
                controller.publishMutation.isPending
              }
              loading={controller.saveDraftMutation.isPending}
              onClick={() => void controller.saveDraft()}
            >
              {t("SAVE_DRAFT")}
            </Button>
          ) : null}
          <Button
            disabled={
              !layer.currentDraft?.id ||
              controller.hasUnsavedChanges ||
              controller.saveDraftMutation.isPending ||
              controller.publishMutation.isPending
            }
            loading={controller.publishMutation.isPending}
            onClick={() => void controller.publish()}
          >
            {t("PUBLISH_ACTION")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function RemovedGuidanceAlert({ isProject }: { isProject: boolean }) {
  const { t } = useTranslation("knowledge");
  return (
    <Alert className="mt-5">
      <AlertTitle>{t(isProject ? "PROJECT_REMOVED_TITLE" : "REMOVED_TITLE")}</AlertTitle>
      <AlertDescription>
        {t(isProject ? "PROJECT_REMOVED_DESCRIPTION" : "REMOVED_DESCRIPTION")}
      </AlertDescription>
    </Alert>
  );
}

function ProjectGuidanceMode({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  return (
    <div className="mt-5 rounded-lg border bg-muted/30 p-4">
      <label
        htmlFor="project-guidance-mode"
        className="text-footnote font-semibold text-label-primary"
      >
        {t("PROJECT_MODE_LABEL")}
      </label>
      <Select
        disabled={controller.saveDraftMutation.isPending || controller.publishMutation.isPending}
        value={controller.projectMode}
        onValueChange={(value) => controller.setProjectMode(value as "supplement" | "override")}
      >
        <SelectTrigger
          id="project-guidance-mode"
          aria-label={t("PROJECT_MODE_LABEL")}
          className="mt-2 w-full sm:max-w-md"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="supplement">{t("PROJECT_MODE_SUPPLEMENT")}</SelectItem>
          <SelectItem value="override">{t("PROJECT_MODE_OVERRIDE")}</SelectItem>
        </SelectContent>
      </Select>
      <p className="mt-2 text-caption text-label-secondary">{t("PROJECT_MODE_HELP")}</p>
    </div>
  );
}

export function GuidanceHistory({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t, i18n } = useTranslation("knowledge");
  const date = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: "medium" }),
    [i18n.language, i18n.resolvedLanguage],
  );

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby="guidance-history-title"
    >
      <h2 id="guidance-history-title" className="text-title3 font-semibold text-label-primary">
        {t("HISTORY_TITLE")}
      </h2>
      <p className="mt-1 max-w-2xl text-footnote text-label-secondary">
        {t("HISTORY_DESCRIPTION")}
      </p>

      <ContentGuard
        className="mt-5"
        loading={controller.historyQuery.isLoading}
        error={controller.historyQuery.error}
        onRetry={() => void controller.historyQuery.refetch()}
        loadingVariant="form"
      >
        {controller.history.length ? (
          <div className="divide-y rounded-lg border">
            {controller.history.map((revision) => (
              <RevisionRow
                key={revision.id}
                revision={revision}
                date={date}
                pending={controller.restorePreviewMutation.isPending}
                onRestore={() => void controller.previewRestore(revision.id)}
              />
            ))}
          </div>
        ) : (
          <Empty className="min-h-40 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("HISTORY_EMPTY_TITLE")}</EmptyTitle>
              <EmptyDescription>{t("HISTORY_EMPTY_DESCRIPTION")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </ContentGuard>

      {controller.historyQuery.hasNextPage ? (
        <Button
          className="mt-4"
          variant="outline"
          loading={controller.historyQuery.isFetchingNextPage}
          onClick={() => void controller.historyQuery.fetchNextPage()}
        >
          {t("HISTORY_LOAD_MORE")}
        </Button>
      ) : null}
    </section>
  );
}

function RevisionRow(props: {
  revision: KnowledgeGuidanceRevisionOut;
  date: Intl.DateTimeFormat;
  pending: boolean;
  onRestore: () => void;
}) {
  const { t } = useTranslation("knowledge");
  const canRestore = props.revision.status !== "draft";
  const createdAt = props.revision.createdAt
    ? props.date.format(new Date(props.revision.createdAt))
    : t("DATE_UNAVAILABLE");

  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-footnote font-semibold text-label-primary">
            {t("REVISION_DETAIL", { revision: props.revision.revisionNumber })}
          </span>
          <RevisionStatusBadge status={props.revision.status} />
        </div>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-caption leading-5 text-label-secondary">
          {props.revision.content}
        </p>
        <p className="mt-2 text-caption text-label-tertiary">{createdAt}</p>
      </div>
      <Button
        className="self-start"
        size="sm"
        variant="outline"
        disabled={!canRestore || props.pending}
        loading={props.pending}
        onClick={props.onRestore}
      >
        <RotateCcw data-icon="inline-start" />
        {t("RESTORE_ACTION")}
      </Button>
    </div>
  );
}

function RevisionStatusBadge({ status }: { status?: string }) {
  const { t } = useTranslation("knowledge");
  const label =
    status === "published"
      ? t("REVISION_PUBLISHED")
      : status === "superseded"
        ? t("REVISION_SUPERSEDED")
        : t("REVISION_DRAFT");
  const variant =
    status === "published" ? "default" : status === "superseded" ? "secondary" : "outline";
  return <Badge variant={variant}>{label}</Badge>;
}
