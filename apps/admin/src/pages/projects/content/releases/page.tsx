import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  cancelScheduledProjectRelease,
  getProjectReleaseDryRun,
  listProjectReleases,
  publishProjectRelease,
  rollbackProjectRelease,
} from "@/api/content";
import { BaseTag } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { buildContentLibraryItemsQueryKey } from "@/pages/projects/content/library/runtime";
import type { AdminRelease } from "@arclayer/openapi/admin-types";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { dateTimeLocalValueToIso } from "@arclayer/ui/date-time-range-field";

const RELEASE_LIST_QUERY_KEY_PREFIX = ["content", "releases"] as const;
const RELEASE_DRY_RUN_QUERY_KEY_PREFIX = ["content", "releases", "dry-run"] as const;

function buildReleaseListQueryKey(workspaceId: string) {
  return [...RELEASE_LIST_QUERY_KEY_PREFIX, workspaceId] as const;
}

function buildReleaseDryRunQueryKey(workspaceId: string) {
  return [...RELEASE_DRY_RUN_QUERY_KEY_PREFIX, workspaceId] as const;
}

function ReadinessMetric(props: {
  label: string;
  value: number | string;
  tone?: "default" | "green" | "gold";
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{props.label}</div>
      <div
        className={
          props.tone === "green"
            ? "mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-300"
            : props.tone === "gold"
              ? "mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300"
              : "mt-2 text-2xl font-semibold text-foreground"
        }
      >
        {props.value}
      </div>
    </div>
  );
}

function DiagnosticList(props: { items: string[]; emptyLabel: string }) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
        {props.emptyLabel}
      </div>
    );
  }

  return (
    <ul className="grid gap-2">
      {props.items.map((item) => (
        <li
          key={item}
          className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm text-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function BlockedItemsList(props: {
  items: Array<{
    itemId: string;
    reasonCode: string;
    workflowStage?: string | null;
  }>;
  emptyLabel: string;
  title: string;
}) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
        {props.emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {props.items.map((item) => (
        <div
          key={`${item.itemId}:${item.reasonCode}`}
          className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium text-foreground">{item.itemId}</div>
            <BaseTag color="gold">{item.reasonCode}</BaseTag>
            {item.workflowStage ? <BaseTag color="default">{item.workflowStage}</BaseTag> : null}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{props.title}</div>
        </div>
      ))}
    </div>
  );
}

function ReleaseHistoryRow(props: {
  canPublish: boolean;
  onCancelSchedule: (releaseId: string) => void;
  onRollback: (releaseId: string) => void;
  pending: boolean;
  release: AdminRelease;
  rollbackingReleaseId: string | null;
}) {
  const { t } = useTranslation("content");
  const lineage = props.release.lineage;
  const status = props.release.status ?? (props.release.isActive ? "active" : "published");
  const canCancelSchedule = status === "scheduled";
  const tagColor =
    status === "active"
      ? "green"
      : status === "scheduled"
        ? "gold"
        : status === "cancelled"
          ? "red"
          : "default";

  return (
    <div className="grid gap-3 rounded-2xl border border-border/60 bg-background/80 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-foreground">
            #{props.release.releaseNumber}
          </div>
          <BaseTag color={tagColor}>
            {t(`CONTENT_RELEASE_STATUS_${String(status).toUpperCase()}`)}
          </BaseTag>
          <span className="text-footnote text-muted-foreground">
            {t("CONTENT_RELEASE_SELECTION_COUNT")}: {props.release.selectionCount ?? 0}
          </span>
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {lineage?.parentReleaseNumber
            ? t("CONTENT_RELEASE_LINEAGE_PARENT", {
                releaseNumber: lineage.parentReleaseNumber,
              })
            : t("CONTENT_RELEASE_NO_LINEAGE")}
        </div>
        <div className="mt-2 text-footnote text-muted-foreground">
          {props.release.scheduledAt
            ? t("CONTENT_RELEASE_SCHEDULED_FOR", { value: props.release.scheduledAt })
            : props.release.activatedAt}
        </div>
      </div>

      <div className="flex items-center justify-start lg:justify-end">
        {canCancelSchedule ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={props.pending}
            disabled={!props.canPublish || props.pending}
            onClick={() => props.onCancelSchedule(props.release.id)}
          >
            <XCircle className="size-4" />
            {t("CONTENT_RELEASE_ACTION_CANCEL_SCHEDULE")}
          </Button>
        ) : !props.release.isActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={props.pending && props.rollbackingReleaseId === props.release.id}
            disabled={!props.canPublish || props.pending}
            onClick={() => props.onRollback(props.release.id)}
          >
            {t("CONTENT_RELEASE_ACTION_ROLLBACK")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ContentReleaseCenterPage(props: { projectId: string }) {
  const { t } = useTranslation("content");
  const queryClient = useQueryClient();
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canPublish = permissionReady && permissionAccess.hasAction("project:release:publish");

  const dryRunQuery = useQuery({
    queryKey: buildReleaseDryRunQueryKey(props.projectId),
    queryFn: async () => getProjectReleaseDryRun(props.projectId),
    enabled: Boolean(props.projectId),
  });
  const releasesQuery = useQuery({
    queryKey: buildReleaseListQueryKey(props.projectId),
    queryFn: async () => listProjectReleases(props.projectId),
    enabled: Boolean(props.projectId),
  });

  const publishMutation = useMutation({
    mutationFn: async () =>
      publishProjectRelease(
        props.projectId,
        publishMode === "scheduled"
          ? { scheduledAt: dateTimeLocalValueToIso(scheduledAt) ?? null }
          : undefined,
      ),
    onSuccess: async () => {
      notifySuccessText(
        publishMode === "scheduled"
          ? t("CONTENT_RELEASE_SCHEDULE_SUCCESS")
          : t("CONTENT_RELEASE_PUBLISH_SUCCESS"),
      );
      if (publishMode === "scheduled") {
        setScheduledAt("");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: buildReleaseDryRunQueryKey(props.projectId) }),
        queryClient.invalidateQueries({ queryKey: buildReleaseListQueryKey(props.projectId) }),
        queryClient.invalidateQueries({
          queryKey: buildContentLibraryItemsQueryKey(props.projectId),
        }),
      ]);
    },
    onError: (error) => notifyError(error),
  });
  const rollbackMutation = useMutation({
    mutationFn: async (releaseId: string) => rollbackProjectRelease(props.projectId, releaseId),
    onSuccess: async () => {
      notifySuccessText(t("CONTENT_RELEASE_ROLLBACK_SUCCESS"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: buildReleaseDryRunQueryKey(props.projectId) }),
        queryClient.invalidateQueries({ queryKey: buildReleaseListQueryKey(props.projectId) }),
        queryClient.invalidateQueries({
          queryKey: buildContentLibraryItemsQueryKey(props.projectId),
        }),
      ]);
    },
    onError: (error) => notifyError(error),
  });
  const cancelScheduleMutation = useMutation({
    mutationFn: async (releaseId: string) =>
      cancelScheduledProjectRelease(props.projectId, releaseId),
    onSuccess: async () => {
      notifySuccessText(t("CONTENT_RELEASE_CANCEL_SCHEDULE_SUCCESS"));
      await queryClient.invalidateQueries({ queryKey: buildReleaseListQueryKey(props.projectId) });
    },
    onError: (error) => notifyError(error),
  });

  const readinessSummary = dryRunQuery.data?.readinessSummary;
  const impact = dryRunQuery.data?.impact;
  const releases = releasesQuery.data?.items ?? [];
  const activeRelease = releases.find((release) => release.isActive) ?? null;
  const blockedItems = impact?.blockedItems ?? [];
  const missingRoutes = impact?.missingRoutes ?? [];
  const unresolvedRelations = impact?.unresolvedRelations ?? [];
  const unpublishedDependencies = impact?.unpublishedDependencies ?? [];
  const ready = readinessSummary?.ready === true;
  const scheduledIso = dateTimeLocalValueToIso(scheduledAt);
  const scheduleReady = publishMode === "now" || Boolean(scheduledIso);
  const busy =
    publishMutation.isPending || rollbackMutation.isPending || cancelScheduleMutation.isPending;

  return (
    <DefaultPage
      title={t("CONTENT_RELEASE_TITLE")}
      showFavoriteToggle={false}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex rounded-md border border-border bg-background p-1">
            <Button
              type="button"
              variant={publishMode === "now" ? "secondary" : "ghost"}
              size="sm"
              disabled={busy}
              onClick={() => setPublishMode("now")}
            >
              <Send className="size-4" />
              {t("CONTENT_RELEASE_MODE_NOW")}
            </Button>
            <Button
              type="button"
              variant={publishMode === "scheduled" ? "secondary" : "ghost"}
              size="sm"
              disabled={busy}
              onClick={() => setPublishMode("scheduled")}
            >
              <CalendarClock className="size-4" />
              {t("CONTENT_RELEASE_MODE_SCHEDULED")}
            </Button>
          </div>
          {publishMode === "scheduled" ? (
            <Input
              type="datetime-local"
              step={60}
              value={scheduledAt}
              aria-label={t("CONTENT_RELEASE_SCHEDULED_AT")}
              className="w-[220px]"
              disabled={busy}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          ) : null}
          <Button
            type="button"
            loading={publishMutation.isPending}
            disabled={!canPublish || !ready || busy || !scheduleReady}
            onClick={() => publishMutation.mutate()}
          >
            {publishMutation.isPending
              ? t("CONTENT_RELEASE_ACTION_PUBLISHING")
              : publishMode === "scheduled"
                ? t("CONTENT_RELEASE_ACTION_SCHEDULE")
                : t("CONTENT_RELEASE_ACTION_PUBLISH")}
          </Button>
        </div>
      }
      contentContainerClassName="mx-auto w-full max-w-7xl"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
        <section className="space-y-6">
          <section
            className="rounded-[28px] border border-border/60 bg-card/70 p-6"
            data-testid="content-release-center"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {t("CONTENT_RELEASE_DRY_RUN_TITLE")}
                </div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {ready ? t("CONTENT_RELEASE_READY") : t("CONTENT_RELEASE_BLOCKED")}
                </h2>
                <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                  {t("CONTENT_RELEASE_DRY_RUN_DESC")}
                </p>
              </div>
              <BaseTag color={ready ? "green" : "gold"}>
                {ready ? t("CONTENT_RELEASE_READY") : t("CONTENT_RELEASE_BLOCKED")}
              </BaseTag>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <ReadinessMetric
                label={t("CONTENT_RELEASE_SELECTED_ITEMS")}
                value={readinessSummary?.selectedItemCount ?? 0}
              />
              <ReadinessMetric
                label={t("CONTENT_RELEASE_BLOCKED_ITEMS")}
                value={readinessSummary?.blockedItemCount ?? 0}
                tone={(readinessSummary?.blockedItemCount ?? 0) > 0 ? "gold" : "green"}
              />
              <ReadinessMetric label={t("CONTENT_RELEASE_HISTORY_TITLE")} value={releases.length} />
            </div>
          </section>

          <section className="rounded-[28px] border border-border/60 bg-card/60 p-6">
            <div className="text-sm font-semibold text-foreground">
              {t("CONTENT_RELEASE_BLOCKERS_TITLE")}
            </div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("CONTENT_RELEASE_DRY_RUN_DESC")}
            </div>

            <div className="mt-5 grid gap-5">
              <div className="grid gap-2">
                <div className="text-sm font-medium text-foreground">
                  {t("CONTENT_RELEASE_BLOCKERS_TITLE")}
                </div>
                <BlockedItemsList
                  items={blockedItems.map((item) => ({
                    itemId: item.itemId,
                    reasonCode: item.reasonCode,
                    workflowStage: item.workflowStage ?? null,
                  }))}
                  emptyLabel={t("CONTENT_RELEASE_BLOCKERS_EMPTY")}
                  title={t("CONTENT_RELEASE_BLOCKED")}
                />
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="grid gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {t("CONTENT_RELEASE_MISSING_ROUTES")}
                  </div>
                  <DiagnosticList
                    items={missingRoutes}
                    emptyLabel={t("CONTENT_RELEASE_BLOCKERS_EMPTY")}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {t("CONTENT_RELEASE_UNRESOLVED_RELATIONS")}
                  </div>
                  <DiagnosticList
                    items={unresolvedRelations}
                    emptyLabel={t("CONTENT_RELEASE_BLOCKERS_EMPTY")}
                  />
                </div>
                <div className="grid gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {t("CONTENT_RELEASE_UNPUBLISHED_DEPENDENCIES")}
                  </div>
                  <DiagnosticList
                    items={unpublishedDependencies}
                    emptyLabel={t("CONTENT_RELEASE_BLOCKERS_EMPTY")}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-border/60 bg-card/60 p-6">
            <div className="text-sm font-semibold text-foreground">
              {t("CONTENT_RELEASE_HISTORY_TITLE")}
            </div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("CONTENT_RELEASE_DESC")}
            </div>

            <div className="mt-5 grid gap-3">
              {releases.length > 0 ? (
                releases.map((release) => (
                  <ReleaseHistoryRow
                    key={release.id}
                    canPublish={canPublish}
                    onCancelSchedule={(releaseId) => cancelScheduleMutation.mutate(releaseId)}
                    onRollback={(releaseId) => rollbackMutation.mutate(releaseId)}
                    pending={rollbackMutation.isPending}
                    release={release}
                    rollbackingReleaseId={rollbackMutation.variables ?? null}
                  />
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/80 px-4 py-4 text-sm text-muted-foreground">
                  {t("CONTENT_RELEASE_EMPTY")}
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="space-y-6">
          <section className="rounded-[28px] border border-border/60 bg-card/60 p-5">
            <div className="text-sm font-semibold text-foreground">
              {t("CONTENT_RELEASE_HISTORY_TITLE")}
            </div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("CONTENT_RELEASE_DESC")}
            </div>

            <div className="mt-4 grid gap-3">
              <ReadinessMetric
                label={t("CONTENT_RELEASE_SELECTED_ITEMS")}
                value={activeRelease?.selectionCount ?? 0}
              />
              <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-4">
                <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("CONTENT_RELEASE_LINEAGE_PARENT", {
                    releaseNumber: activeRelease?.lineage?.parentReleaseNumber ?? "-",
                  })}
                </div>
                <div className="mt-2 text-sm text-foreground">
                  {activeRelease?.lineage?.parentReleaseNumber
                    ? t("CONTENT_RELEASE_LINEAGE_PARENT", {
                        releaseNumber: activeRelease.lineage.parentReleaseNumber,
                      })
                    : t("CONTENT_RELEASE_NO_LINEAGE")}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-border/60 bg-card/60 p-5">
            <div className="text-sm font-semibold text-foreground">
              {t("CONTENT_RELEASE_DRY_RUN_TITLE")}
            </div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              {ready ? t("CONTENT_RELEASE_READY") : t("CONTENT_RELEASE_BLOCKED")}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(readinessSummary?.blockerCodes ?? []).length > 0 ? (
                (readinessSummary?.blockerCodes ?? []).map((code) => (
                  <BaseTag key={code} color="gold">
                    {code}
                  </BaseTag>
                ))
              ) : (
                <BaseTag color="green">{t("CONTENT_RELEASE_READY")}</BaseTag>
              )}
            </div>
          </section>

          {(dryRunQuery.isLoading || releasesQuery.isLoading) &&
          !dryRunQuery.data &&
          !releasesQuery.data ? (
            <div className="rounded-[28px] border border-border/60 bg-card/60 px-5 py-4 text-sm text-muted-foreground">
              {t("CONTENT_RELEASE_DRY_RUN_DESC")}
            </div>
          ) : null}
        </aside>
      </div>
    </DefaultPage>
  );
}
