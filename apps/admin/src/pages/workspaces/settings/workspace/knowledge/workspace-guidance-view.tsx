import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertCircle, BookOpenText, History, Link2, RotateCcw, Send, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { KnowledgeGuidanceRevisionOut } from "@arclayer/openapi";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { Alert, AlertDescription, AlertTitle } from "@arclayer/ui/alert";
import { Badge } from "@arclayer/ui/badge";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { Textarea } from "@arclayer/ui/textarea";

import { WorkspaceGuidanceImpactDialog } from "./workspace-guidance-impact-dialog";
import {
  useWorkspaceGuidanceController,
  type WorkspaceGuidanceController,
} from "./use-workspace-guidance-controller";

const WORKSPACE_PREVIEW_VALUE = "workspace";

export function WorkspaceGuidanceView({ workspaceId }: { workspaceId: string }) {
  return <GuidanceLayerView workspaceId={workspaceId} />;
}

export function ProjectGuidanceView(props: { workspaceId: string; projectId: string }) {
  return <GuidanceLayerView {...props} />;
}

function GuidanceLayerView(props: { workspaceId: string; projectId?: string }) {
  const { t } = useTranslation(["knowledge", "common"]);
  const controller = useWorkspaceGuidanceController(props);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 pb-8">
      {controller.commandError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("knowledge:OPERATION_FAILED_TITLE")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("knowledge:OPERATION_FAILED_DESCRIPTION")}</span>
            <Button size="sm" variant="outline" onClick={controller.resetCommandErrors}>
              {t("common:DISMISS")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ContentGuard
        loading={controller.guidanceQuery.isLoading}
        error={controller.guidanceQuery.error}
        onRetry={() => void controller.guidanceQuery.refetch()}
        loadingVariant="form"
      >
        {controller.layer ? (
          <>
            <GuidanceEditor controller={controller} />
            <EffectivePreview controller={controller} />
            <GuidanceHistory controller={controller} />
            <GuidanceReferences controller={controller} />
          </>
        ) : null}
      </ContentGuard>

      <WorkspaceGuidanceImpactDialog
        pendingPreview={controller.pendingPreview}
        pending={controller.applyPreviewMutation.isPending}
        error={controller.applyPreviewMutation.error}
        scope={controller.isProject ? "project" : "workspace"}
        onOpenChange={(open) => {
          if (!open) controller.setPendingPreview(null);
        }}
        onApply={() => void controller.applyPendingPreview()}
      />
    </div>
  );
}

function GuidanceEditor({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const layer = controller.layer!;
  const currentRevision = layer.currentDraft ?? layer.currentPublished ?? null;
  const hasContent = Boolean(currentRevision?.content);

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby="guidance-editor-title"
    >
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="guidance-editor-title" className="text-title2 font-bold text-label-primary">
              {t(controller.isProject ? "PROJECT_EDITOR_TITLE" : "EDITOR_TITLE")}
            </h2>
            {currentRevision ? <RevisionStatusBadge status={currentRevision.status} /> : null}
          </div>
          <p className="mt-1 max-w-2xl text-footnote leading-6 text-label-secondary">
            {t(controller.isProject ? "PROJECT_EDITOR_DESCRIPTION" : "EDITOR_DESCRIPTION")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!hasContent || controller.removePreviewMutation.isPending}
            loading={controller.removePreviewMutation.isPending}
            onClick={() => void controller.previewRemoval()}
          >
            <Trash2 data-icon="inline-start" />
            {t("REMOVE_ACTION")}
          </Button>
          <Button
            variant="outline"
            disabled={!controller.draft.trim() || controller.saveDraftMutation.isPending}
            loading={controller.saveDraftMutation.isPending}
            onClick={() => void controller.saveDraft()}
          >
            {t("SAVE_DRAFT")}
          </Button>
          <Button
            disabled={!layer.currentDraft?.id || controller.publishMutation.isPending}
            loading={controller.publishMutation.isPending}
            onClick={() => void controller.publish()}
          >
            <Send data-icon="inline-start" />
            {t("PUBLISH_ACTION")}
          </Button>
        </div>
      </div>

      {layer.removedAt ? (
        <Alert className="mt-5">
          <AlertTitle>
            {t(controller.isProject ? "PROJECT_REMOVED_TITLE" : "REMOVED_TITLE")}
          </AlertTitle>
          <AlertDescription>
            {t(controller.isProject ? "PROJECT_REMOVED_DESCRIPTION" : "REMOVED_DESCRIPTION")}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-5">
        <label
          htmlFor="workspace-guidance-content"
          className="text-footnote font-semibold text-label-primary"
        >
          {t("EDITOR_FIELD_LABEL")}
        </label>
        <Textarea
          id="workspace-guidance-content"
          className="mt-2 min-h-72 font-mono text-footnote leading-6"
          value={controller.draft}
          onChange={(event) => controller.setDraft(event.target.value)}
          placeholder={t("EDITOR_PLACEHOLDER")}
        />
        <p className="mt-2 text-caption text-label-secondary" aria-live="polite">
          {currentRevision
            ? t("REVISION_DETAIL", { revision: currentRevision.revisionNumber })
            : t("NO_REVISION_YET")}
        </p>
      </div>

      {controller.isProject ? (
        <div className="mt-5 rounded-lg border bg-muted/30 p-4">
          <label
            htmlFor="project-guidance-mode"
            className="text-footnote font-semibold text-label-primary"
          >
            {t("PROJECT_MODE_LABEL")}
          </label>
          <Select
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
      ) : null}
    </section>
  );
}

function EffectivePreview({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const effective = controller.effectiveQuery.data;

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby="guidance-effective-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="guidance-effective-title"
            className="text-title3 font-semibold text-label-primary"
          >
            {t("EFFECTIVE_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">{t("EFFECTIVE_DESCRIPTION")}</p>
        </div>
        {controller.isProject ? (
          <span className="text-footnote text-label-secondary">
            {t("EFFECTIVE_CURRENT_PROJECT")}
          </span>
        ) : (
          <div className="w-full sm:w-64">
            <label className="sr-only" htmlFor="guidance-effective-project">
              {t("EFFECTIVE_PROJECT_LABEL")}
            </label>
            <Select
              value={controller.selectedProjectId ?? WORKSPACE_PREVIEW_VALUE}
              onValueChange={(value) =>
                controller.setSelectedProjectId(value === WORKSPACE_PREVIEW_VALUE ? null : value)
              }
            >
              <SelectTrigger
                id="guidance-effective-project"
                aria-label={t("EFFECTIVE_PROJECT_LABEL")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WORKSPACE_PREVIEW_VALUE}>{t("EFFECTIVE_WORKSPACE")}</SelectItem>
                {controller.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {!controller.isProject && controller.projectsQuery.isError ? (
        <Alert className="mt-4" variant="destructive">
          <AlertTitle>{t("PROJECTS_LOAD_FAILED_TITLE")}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("PROJECTS_LOAD_FAILED_DESCRIPTION")}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void controller.projectsQuery.refetch()}
            >
              {t("RETRY")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <ContentGuard
        className="mt-5"
        loading={controller.effectiveQuery.isLoading}
        error={controller.effectiveQuery.error}
        onRetry={() => void controller.effectiveQuery.refetch()}
        loadingVariant="form"
      >
        {effective ? (
          <div className="space-y-4">
            <div
              className="flex flex-wrap items-center gap-2"
              aria-label={t("EFFECTIVE_PRECEDENCE_LABEL")}
            >
              <span className="text-caption font-medium text-label-secondary">
                {t("EFFECTIVE_PRECEDENCE_LABEL")}
              </span>
              {(effective.precedence ?? []).map((scope) => (
                <Badge key={scope} variant="outline">
                  {scope === "project" ? t("PRECEDENCE_PROJECT") : t("PRECEDENCE_WORKSPACE")}
                </Badge>
              ))}
            </div>
            {effective.conflicts?.map((conflict) => (
              <Alert key={conflict.code} variant="destructive">
                <AlertTitle>{t("CONFLICT_OVERRIDE_TITLE")}</AlertTitle>
                <AlertDescription>{t("CONFLICT_OVERRIDE_DESCRIPTION")}</AlertDescription>
              </Alert>
            ))}
            {effective.unavailable?.map((unavailable) => (
              <Alert key={unavailable.code}>
                <AlertTitle>{unavailableTitle(t, unavailable.code)}</AlertTitle>
                <AlertDescription>{unavailableDescription(t, unavailable.code)}</AlertDescription>
              </Alert>
            ))}
            {effective.effectiveContent ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-footnote leading-6 text-label-primary">
                {effective.effectiveContent}
              </pre>
            ) : (
              <Empty className="min-h-44 border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <BookOpenText aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>{t("EFFECTIVE_EMPTY_TITLE")}</EmptyTitle>
                  <EmptyDescription>{t("EFFECTIVE_EMPTY_DESCRIPTION")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        ) : null}
      </ContentGuard>
    </section>
  );
}

function GuidanceHistory({ controller }: { controller: WorkspaceGuidanceController }) {
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
      <div className="flex items-start gap-3">
        <History className="mt-0.5 size-5 text-label-secondary" aria-hidden="true" />
        <div>
          <h2 id="guidance-history-title" className="text-title3 font-semibold text-label-primary">
            {t("HISTORY_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">{t("HISTORY_DESCRIPTION")}</p>
        </div>
      </div>

      <Button asChild className="mt-4" size="sm" variant="outline">
        <Link to="/customization/knowledge/references">{t("REFERENCES_MANAGE_ACTION")}</Link>
      </Button>

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
          <Empty className="min-h-44 border border-dashed">
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

function GuidanceReferences({ controller }: { controller: WorkspaceGuidanceController }) {
  const { t } = useTranslation("knowledge");
  const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(null);
  const layer = controller.layer!;
  const bases = controller.referenceBasesQuery.data?.items ?? [];
  const baseById = useMemo(() => new Map(bases.map((base) => [base.id, base])), [bases]);
  const attachedIds = new Set(
    (layer.references ?? []).map((reference) => reference.knowledgeBaseId),
  );
  const availableBases = bases.filter(
    (base) => base.status === "active" && !attachedIds.has(base.id),
  );

  return (
    <section
      className="rounded-xl border bg-card p-4 sm:p-6"
      aria-labelledby="guidance-references-title"
    >
      <div className="flex items-start gap-3">
        <Link2 className="mt-0.5 size-5 text-label-secondary" aria-hidden="true" />
        <div>
          <h2
            id="guidance-references-title"
            className="text-title3 font-semibold text-label-primary"
          >
            {t("REFERENCES_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">{t("REFERENCES_DESCRIPTION")}</p>
        </div>
      </div>

      <ContentGuard
        className="mt-5"
        loading={controller.referenceBasesQuery.isLoading}
        error={controller.referenceBasesQuery.error}
        onRetry={() => void controller.referenceBasesQuery.refetch()}
        loadingVariant="form"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select value={selectedReferenceId ?? undefined} onValueChange={setSelectedReferenceId}>
            <SelectTrigger aria-label={t("REFERENCE_PICKER_LABEL")} className="w-full sm:max-w-md">
              <SelectValue placeholder={t("REFERENCE_PICKER_PLACEHOLDER")} />
            </SelectTrigger>
            <SelectContent>
              {availableBases.map((base) => (
                <SelectItem key={base.id} value={base.id}>
                  {base.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!selectedReferenceId || controller.attachReferenceMutation.isPending}
            loading={controller.attachReferenceMutation.isPending}
            onClick={() => {
              if (!selectedReferenceId) return;
              controller.attachReferenceMutation.mutate(selectedReferenceId, {
                onSuccess: () => setSelectedReferenceId(null),
              });
            }}
          >
            {t("REFERENCE_ATTACH_ACTION")}
          </Button>
        </div>

        {(layer.references ?? []).length ? (
          <div className="mt-4 divide-y rounded-lg border">
            {(layer.references ?? []).map((reference) => {
              const base = baseById.get(reference.knowledgeBaseId);
              return (
                <div
                  key={reference.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-footnote font-semibold text-label-primary">
                      {base?.name ?? reference.knowledgeBaseId}
                    </p>
                    <p className="mt-1 text-caption text-label-secondary">
                      {base
                        ? t("REFERENCE_FRESHNESS", {
                            ready: base.readySourceCount,
                            total: base.sourceCount,
                          })
                        : t("REFERENCE_METADATA_UNAVAILABLE")}
                    </p>
                  </div>
                  <Button
                    className="self-start"
                    size="sm"
                    variant="outline"
                    disabled={controller.detachReferenceMutation.isPending}
                    loading={controller.detachReferenceMutation.isPending}
                    onClick={() =>
                      controller.detachReferenceMutation.mutate(reference.knowledgeBaseId)
                    }
                  >
                    {t("REFERENCE_DETACH_ACTION")}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 text-footnote text-label-secondary">{t("REFERENCES_EMPTY")}</p>
        )}
      </ContentGuard>
    </section>
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

function unavailableTitle(t: (key: string) => string, code: string): string {
  return code.endsWith("removed")
    ? t("UNAVAILABLE_REMOVED_TITLE")
    : t("UNAVAILABLE_UNPUBLISHED_TITLE");
}

function unavailableDescription(t: (key: string) => string, code: string): string {
  return code.endsWith("removed")
    ? t("UNAVAILABLE_REMOVED_DESCRIPTION")
    : t("UNAVAILABLE_UNPUBLISHED_DESCRIPTION");
}
