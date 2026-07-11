import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  LoaderCircle,
  RotateCcw,
  Rocket,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildProjectReleasesQueryKey,
  getProjectReleaseDryRun,
  listProjectReleases,
  publishProjectRelease,
  rollbackProjectRelease,
} from "@/api/project-releases";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";
import type { AdminRelease, AdminReleaseDryRun } from "@arclayer/openapi/admin-types";

function releaseStatusLabelKey(status: string) {
  return `SETTINGS_PROJECT_RELEASES_STATUS_${status.toUpperCase()}`;
}

function ReleaseStatusTag({ release }: { release: AdminRelease }) {
  const { t } = useTranslation("account");
  const color = release.isActive
    ? "green"
    : release.status === "scheduled"
      ? "gold"
      : release.status === "cancelled"
        ? "red"
        : "default";
  return <BaseTag color={color}>{t(releaseStatusLabelKey(release.status))}</BaseTag>;
}

function selectActiveRelease(releases: readonly AdminRelease[]) {
  return releases.find((release) => release.isActive) ?? null;
}

function ReleaseSummary(props: { activeRelease: AdminRelease | null }) {
  const { t } = useTranslation("account");
  return (
    <section className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-label-secondary">
        <Rocket aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-title3 font-semibold text-label-primary">
            {props.activeRelease
              ? t("SETTINGS_PROJECT_RELEASES_ACTIVE_RELEASE", {
                  count: props.activeRelease.releaseNumber,
                })
              : t("SETTINGS_PROJECT_RELEASES_NO_ACTIVE_RELEASE")}
          </h2>
          {props.activeRelease ? <ReleaseStatusTag release={props.activeRelease} /> : null}
        </div>
        <p className="mt-1 text-footnote text-label-secondary">
          {props.activeRelease
            ? t("SETTINGS_PROJECT_RELEASES_ACTIVE_SUMMARY", {
                count: props.activeRelease.selectionCount ?? 0,
              })
            : t("SETTINGS_PROJECT_RELEASES_EMPTY_DESC")}
        </p>
      </div>
    </section>
  );
}

function ReleaseActions(props: {
  canPublish: boolean;
  checking: boolean;
  publishing: boolean;
  ready: boolean;
  onCheck: () => void;
  onPublish: () => void;
}) {
  const { t } = useTranslation("account");
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={props.checking}
        disabled={props.publishing}
        onClick={props.onCheck}
        data-testid="project-release-check"
      >
        <CheckCircle2 aria-hidden="true" />
        {t("SETTINGS_PROJECT_RELEASES_CHECK")}
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!props.canPublish || !props.ready || props.checking || props.publishing}
        onClick={props.onPublish}
        data-testid="project-release-publish"
      >
        {t("SETTINGS_PROJECT_RELEASES_PUBLISH")}
      </Button>
    </>
  );
}

type CheckMetricProps = {
  count: number;
  label: string;
};

function CheckMetric({ count, label }: CheckMetricProps) {
  return (
    <div className="min-w-0 px-4 py-4 first:pl-0 last:pr-0">
      <div className="font-mono text-title3 font-semibold text-label-primary">{count}</div>
      <div className="mt-1 text-footnote text-label-secondary">{label}</div>
    </div>
  );
}

function ReadinessPanel(props: { dryRun: AdminReleaseDryRun | null; pending: boolean }) {
  const { t } = useTranslation("account");
  const summary = props.dryRun?.readinessSummary;
  const impact = props.dryRun?.impact;

  return (
    <section
      className="grid gap-4 rounded-lg border border-border p-4"
      data-testid="project-release-readiness"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-headline font-semibold text-label-primary">
            {t("SETTINGS_PROJECT_RELEASES_READINESS_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">
            {t("SETTINGS_PROJECT_RELEASES_READINESS_SHORT_DESC")}
          </p>
        </div>
        {props.pending ? (
          <div className="flex items-center gap-2 text-footnote text-label-secondary">
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            {t("SETTINGS_PROJECT_RELEASES_CHECKING")}
          </div>
        ) : summary ? (
          <div className="flex items-center gap-2">
            {summary.ready ? (
              <CheckCircle2 className="text-positive" aria-hidden="true" />
            ) : (
              <CircleAlert className="text-warning" aria-hidden="true" />
            )}
            <span className="text-callout font-medium text-label-primary">
              {summary.ready
                ? t("SETTINGS_PROJECT_RELEASES_READY")
                : t("SETTINGS_PROJECT_RELEASES_BLOCKED")}
            </span>
          </div>
        ) : null}
      </div>

      {summary && impact ? (
        <div className="grid divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
          <CheckMetric
            count={summary.selectedItemCount ?? 0}
            label={t("SETTINGS_PROJECT_RELEASES_SELECTION_COUNT")}
          />
          <CheckMetric
            count={impact.missingRoutes?.length ?? 0}
            label={t("SETTINGS_PROJECT_RELEASES_MISSING_ROUTES")}
          />
          <CheckMetric
            count={impact.unpublishedDependencies?.length ?? 0}
            label={t("SETTINGS_PROJECT_RELEASES_UNPUBLISHED_DEPENDENCIES")}
          />
          <CheckMetric
            count={impact.unresolvedRelations?.length ?? 0}
            label={t("SETTINGS_PROJECT_RELEASES_UNRESOLVED_RELATIONS")}
          />
        </div>
      ) : null}
    </section>
  );
}

type ReleaseHistoryProps = {
  canRollback: boolean;
  formatDateTime: (value: string | null | undefined) => string;
  pending: boolean;
  releases: readonly AdminRelease[];
  onRollback: (release: AdminRelease) => void;
};

function ReleaseHistory(props: ReleaseHistoryProps) {
  const { t } = useTranslation("account");
  return (
    <section className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-headline font-semibold text-label-primary">
            <History aria-hidden="true" />
            {t("SETTINGS_PROJECT_RELEASES_HISTORY_TITLE")}
          </h2>
          <p className="mt-1 text-footnote text-label-secondary">
            {t("SETTINGS_PROJECT_RELEASES_HISTORY_SHORT_DESC")}
          </p>
        </div>
        <span className="text-footnote text-label-secondary">
          {t("SETTINGS_PROJECT_RELEASES_HISTORY_COUNT", { count: props.releases.length })}
        </span>
      </div>

      {props.releases.length === 0 ? (
        <Empty
          className="border border-dashed border-border"
          data-testid="project-releases-empty-state"
        >
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyTitle>{t("SETTINGS_PROJECT_RELEASES_EMPTY_TITLE")}</EmptyTitle>
            <EmptyDescription>{t("SETTINGS_PROJECT_RELEASES_EMPTY_DESC")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className="overflow-hidden rounded-lg border border-border"
          data-testid="project-releases-list"
        >
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4">{t("SETTINGS_PROJECT_RELEASES_VERSION")}</TableHead>
                <TableHead>{t("SETTINGS_PROJECT_RELEASES_SELECTION_COUNT")}</TableHead>
                <TableHead>{t("SETTINGS_PROJECT_RELEASES_CREATED")}</TableHead>
                <TableHead>{t("SETTINGS_PROJECT_RELEASES_ACTIVATED")}</TableHead>
                <TableHead className="px-4 text-right">
                  {t("SETTINGS_PROJECT_RELEASES_ACTIONS")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.releases.map((release) => {
                const canRollback =
                  props.canRollback && !release.isActive && release.status !== "cancelled";
                return (
                  <TableRow key={release.id}>
                    <TableCell className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-label-primary">
                          {t("SETTINGS_PROJECT_RELEASES_RELEASE_NUMBER", {
                            count: release.releaseNumber,
                          })}
                        </span>
                        <ReleaseStatusTag release={release} />
                      </div>
                      {release.lineage?.parentReleaseNumber ? (
                        <div className="mt-1 text-footnote text-label-secondary">
                          {t("SETTINGS_PROJECT_RELEASES_PARENT", {
                            count: release.lineage.parentReleaseNumber,
                          })}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>{release.selectionCount ?? 0}</TableCell>
                    <TableCell>{props.formatDateTime(release.createdAt)}</TableCell>
                    <TableCell>{props.formatDateTime(release.activatedAt)}</TableCell>
                    <TableCell className="px-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!canRollback || props.pending}
                        onClick={() => props.onRollback(release)}
                        data-testid={`project-release-rollback-${release.id}`}
                      >
                        <RotateCcw aria-hidden="true" />
                        {t("SETTINGS_PROJECT_RELEASES_ROLLBACK")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

type ProjectReleasesPageProps = {
  projectId: string;
  embedded?: boolean;
};

export function ProjectReleasesPage(props: ProjectReleasesPageProps) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const { formatDateTime } = useAdminDateTimeFormatter({ projectId: props.projectId });
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<AdminRelease | null>(null);

  const releasesQuery = useQuery({
    queryKey: buildProjectReleasesQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: () => listProjectReleases(props.projectId),
  });
  const dryRunQuery = useQuery({
    queryKey: [...buildProjectReleasesQueryKey(props.projectId), "dry-run"],
    enabled: Boolean(props.projectId),
    queryFn: () => getProjectReleaseDryRun(props.projectId),
    meta: { silent: true },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildProjectReleasesQueryKey(props.projectId),
    });
  };

  const publishMutation = useMutation({
    mutationFn: () => publishProjectRelease(props.projectId),
    onSuccess: async (result) => {
      setPublishDialogOpen(false);
      notifySuccessText(
        t("account:SETTINGS_PROJECT_RELEASES_PUBLISHED", {
          count: result.release.releaseNumber,
        }),
      );
      await invalidate();
    },
    onError: notifyError,
  });
  const rollbackMutation = useMutation({
    mutationFn: () => {
      if (!rollbackTarget) throw new Error("ROLLBACK_RELEASE_REQUIRED");
      return rollbackProjectRelease(props.projectId, rollbackTarget.id);
    },
    onSuccess: async (result) => {
      notifySuccessText(
        t("account:SETTINGS_PROJECT_RELEASES_ROLLED_BACK", {
          count: result.release.releaseNumber,
        }),
      );
      setRollbackTarget(null);
      await invalidate();
    },
    onError: notifyError,
  });

  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canPublish = permissionReady && permissionAccess.hasAction("project:release:publish");
  const canRollback = permissionReady && permissionAccess.hasAction("project:release:rollback");
  const releases = releasesQuery.data ?? [];
  const activeRelease = selectActiveRelease(releases);
  const ready = Boolean(dryRunQuery.data?.readinessSummary.ready);
  const pending = publishMutation.isPending || rollbackMutation.isPending;
  const releaseActions = (
    <ReleaseActions
      canPublish={canPublish}
      checking={dryRunQuery.isFetching}
      publishing={publishMutation.isPending}
      ready={ready}
      onCheck={() => void dryRunQuery.refetch()}
      onPublish={() => setPublishDialogOpen(true)}
    />
  );

  const content = (
    <ContentGuard
      loading={releasesQuery.isLoading || dryRunQuery.isLoading}
      loadingVariant="table"
      error={releasesQuery.error ?? dryRunQuery.error}
      onRetry={
        releasesQuery.isError || dryRunQuery.isError
          ? () => {
              void releasesQuery.refetch();
              void dryRunQuery.refetch();
            }
          : undefined
      }
    >
      <div className="grid gap-8">
        {permissionReady && !canPublish ? (
          <AccessNoticeAlert
            data-testid="project-releases-read-only-notice"
            description={t("account:SETTINGS_PROJECT_RELEASES_READ_ONLY_DESC")}
          />
        ) : null}
        <ReleaseSummary activeRelease={activeRelease} />
        <ReadinessPanel dryRun={dryRunQuery.data ?? null} pending={dryRunQuery.isFetching} />
        <ReleaseHistory
          releases={releases}
          canRollback={canRollback}
          pending={pending}
          formatDateTime={formatDateTime}
          onRollback={setRollbackTarget}
        />
      </div>
    </ContentGuard>
  );

  return (
    <>
      {props.embedded ? (
        <section
          className="grid gap-5"
          aria-labelledby="project-domain-release-title"
          data-testid="project-domain-release-content"
        >
          <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-label-secondary">
                <Rocket aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="project-domain-release-title"
                  className="text-title3 font-semibold text-label-primary"
                >
                  {t("account:SETTINGS_PROJECT_DOMAINS_RELEASE_TITLE")}
                </h2>
                <p className="mt-1 max-w-2xl text-footnote text-label-secondary">
                  {t("account:SETTINGS_PROJECT_DOMAINS_RELEASE_DESC")}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">{releaseActions}</div>
          </header>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">{content}</div>
        </section>
      ) : (
        <DefaultPage
          title={t("account:SETTINGS_PROJECT_RELEASES_TITLE")}
          description={t("account:SETTINGS_PROJECT_RELEASES_DESC")}
          action={releaseActions}
        >
          {content}
        </DefaultPage>
      )}

      <SettingDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        preventInitialFocus={false}
        title={t("account:SETTINGS_PROJECT_RELEASES_PUBLISH_DIALOG_TITLE")}
        description={t("account:SETTINGS_PROJECT_RELEASES_PUBLISH_DIALOG_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPublishDialogOpen(false)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={publishMutation.isPending}
              disabled={!ready}
              onClick={() => void publishMutation.mutateAsync()}
              data-testid="project-release-publish-confirm"
            >
              <Rocket aria-hidden="true" />
              {t("account:SETTINGS_PROJECT_RELEASES_PUBLISH")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_RELEASES_PUBLISH_SELECTION")}
            description={t("account:SETTINGS_PROJECT_RELEASES_PUBLISH_SELECTION_DESC")}
          >
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
              <CheckCircle2 className="text-positive" aria-hidden="true" />
              <span className="text-callout font-medium text-label-primary">
                {t("account:SETTINGS_PROJECT_RELEASES_SELECTED_COUNT", {
                  count: dryRunQuery.data?.readinessSummary.selectedItemCount ?? 0,
                })}
              </span>
            </div>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>

      <SettingDialog
        open={Boolean(rollbackTarget)}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
        preventInitialFocus={false}
        title={t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK_DIALOG_TITLE")}
        description={t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK_DIALOG_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRollbackTarget(null)}>
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={rollbackMutation.isPending}
              disabled={!rollbackTarget}
              onClick={() => void rollbackMutation.mutateAsync()}
              data-testid="project-release-rollback-confirm"
            >
              <RotateCcw aria-hidden="true" />
              {t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK_TARGET")}
            description={
              rollbackTarget
                ? t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK_TARGET_DESC", {
                    count: rollbackTarget.releaseNumber,
                  })
                : ""
            }
          >
            <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 px-3 py-3">
              <Clock3 aria-hidden="true" />
              <span className="text-callout font-medium text-label-primary">
                {rollbackTarget
                  ? t("account:SETTINGS_PROJECT_RELEASES_RELEASE_NUMBER", {
                      count: rollbackTarget.releaseNumber,
                    })
                  : "-"}
              </span>
            </div>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
