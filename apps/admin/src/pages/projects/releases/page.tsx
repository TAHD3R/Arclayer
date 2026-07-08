import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  Globe2,
  History,
  LoaderCircle,
  Monitor,
  RotateCcw,
  Rocket,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import type { AdminRelease, AdminReleaseDryRun } from "@arclayer/openapi/admin-types";

type ProjectReleaseWorkflowLink = {
  description: string;
  href: string;
  icon: LucideIcon;
  id: string;
  label: string;
};

function releaseStatusLabelKey(status: string): string {
  return `SETTINGS_PROJECT_RELEASES_STATUS_${status.toUpperCase()}`;
}

function buildProjectReleaseWorkflowLinks(
  projectId: string,
  t: (key: string) => string,
): ProjectReleaseWorkflowLink[] {
  return [
    {
      description: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_EDITOR_DESC"),
      href: `/projects/${projectId}/editor`,
      icon: Monitor,
      id: "editor",
      label: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_EDITOR"),
    },
    {
      description: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_CONTENT_DESC"),
      href: `/projects/${projectId}/content/library`,
      icon: BookOpen,
      id: "content-library",
      label: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_CONTENT"),
    },
    {
      description: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_WEBSITE_CONTROL_DESC"),
      href: `/projects/${projectId}/website/domain`,
      icon: Globe2,
      id: "website-control",
      label: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_WEBSITE_CONTROL"),
    },
    {
      description: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_WEBSITE_CONFIG_DESC"),
      href: `/projects/${projectId}/website/config`,
      icon: Settings2,
      id: "website-config",
      label: t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINK_WEBSITE_CONFIG"),
    },
  ];
}

function ReleaseStatusTag(props: { release: AdminRelease }) {
  const { t } = useTranslation("account");
  const color = props.release.isActive
    ? "green"
    : props.release.status === "scheduled"
      ? "gold"
      : props.release.status === "cancelled"
        ? "red"
        : "default";
  return <BaseTag color={color}>{t(releaseStatusLabelKey(props.release.status))}</BaseTag>;
}

function ReadinessOverview(props: { dryRun: AdminReleaseDryRun | null; pending: boolean }) {
  const { t } = useTranslation("account");
  const summary = props.dryRun?.readinessSummary ?? null;

  if (props.pending) {
    return (
      <div className="flex items-center gap-2 text-callout text-label-secondary">
        <LoaderCircle className="animate-spin" size={16} />
        {t("SETTINGS_PROJECT_RELEASES_CHECKING")}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center gap-2 text-callout text-label-secondary">
        <ShieldAlert size={16} />
        {t("SETTINGS_PROJECT_RELEASES_READINESS_IDLE")}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <BaseTag color={summary.ready ? "green" : "gold"}>
        {summary.ready
          ? t("SETTINGS_PROJECT_RELEASES_READY")
          : t("SETTINGS_PROJECT_RELEASES_BLOCKED")}
      </BaseTag>
      <BaseTag color="default">
        {t("SETTINGS_PROJECT_RELEASES_SELECTED_COUNT", {
          count: summary.selectedItemCount ?? 0,
        })}
      </BaseTag>
      {(summary.blockedItemCount ?? 0) > 0 ? (
        <BaseTag color="gold">
          {t("SETTINGS_PROJECT_RELEASES_BLOCKED_COUNT", {
            count: summary.blockedItemCount ?? 0,
          })}
        </BaseTag>
      ) : null}
    </div>
  );
}

function ReleaseImpactDetails(props: { dryRun: AdminReleaseDryRun | null }) {
  const { t } = useTranslation("account");
  const impact = props.dryRun?.impact;
  if (!impact) return null;

  const missingRoutes = impact.missingRoutes?.length ?? 0;
  const unpublishedDependencies = impact.unpublishedDependencies?.length ?? 0;
  const unresolvedRelations = impact.unresolvedRelations?.length ?? 0;

  return (
    <div className="grid gap-3 border-t border-border pt-4 md:grid-cols-3">
      <div>
        <div className="text-title3 font-semibold text-label-primary">{missingRoutes}</div>
        <div className="mt-1 text-footnote text-label-secondary">
          {t("SETTINGS_PROJECT_RELEASES_MISSING_ROUTES")}
        </div>
      </div>
      <div>
        <div className="text-title3 font-semibold text-label-primary">
          {unpublishedDependencies}
        </div>
        <div className="mt-1 text-footnote text-label-secondary">
          {t("SETTINGS_PROJECT_RELEASES_UNPUBLISHED_DEPENDENCIES")}
        </div>
      </div>
      <div>
        <div className="text-title3 font-semibold text-label-primary">{unresolvedRelations}</div>
        <div className="mt-1 text-footnote text-label-secondary">
          {t("SETTINGS_PROJECT_RELEASES_UNRESOLVED_RELATIONS")}
        </div>
      </div>
    </div>
  );
}

function ProjectReleaseWorkflowPanel(props: {
  activeRelease: AdminRelease | null;
  dryRun: AdminReleaseDryRun | null;
  links: readonly ProjectReleaseWorkflowLink[];
}) {
  const { t } = useTranslation("account");
  const readiness = props.dryRun?.readinessSummary ?? null;
  const stateLabel = readiness
    ? readiness.ready
      ? t("SETTINGS_PROJECT_RELEASES_READY")
      : t("SETTINGS_PROJECT_RELEASES_BLOCKED")
    : t("SETTINGS_PROJECT_RELEASES_READINESS_IDLE");
  const releaseLabel = props.activeRelease
    ? t("SETTINGS_PROJECT_RELEASES_ACTIVE_RELEASE", {
        count: props.activeRelease.releaseNumber,
      })
    : t("SETTINGS_PROJECT_RELEASES_NO_ACTIVE_RELEASE");

  return (
    <section
      aria-label={t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LABEL")}
      className="grid gap-4 border-y border-border bg-background py-5"
      data-testid="project-releases-workflow-panel"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.7fr)]">
        <div className="min-w-0 space-y-2 px-1">
          <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-normal text-label-tertiary">
            <Globe2 size={14} />
            {t("SETTINGS_PROJECT_RELEASES_WORKFLOW_EYEBROW")}
          </div>
          <h2 className="text-title3 font-semibold text-label-primary">
            {t("SETTINGS_PROJECT_RELEASES_WORKFLOW_TITLE")}
          </h2>
          <p className="max-w-3xl text-callout text-label-secondary">
            {t("SETTINGS_PROJECT_RELEASES_WORKFLOW_DESC")}
          </p>
        </div>

        <div className="grid gap-2 rounded-md border border-border bg-muted/20 px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-label-secondary">
              {t("SETTINGS_PROJECT_RELEASES_WORKFLOW_STATE_RELEASE")}
            </span>
            <span className="truncate text-footnote font-medium text-label-primary">
              {releaseLabel}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-footnote text-label-secondary">
              {t("SETTINGS_PROJECT_RELEASES_WORKFLOW_STATE_READINESS")}
            </span>
            <span className="truncate text-footnote font-medium text-label-primary">
              {stateLabel}
            </span>
          </div>
        </div>
      </div>

      <nav
        aria-label={t("SETTINGS_PROJECT_RELEASES_WORKFLOW_LINKS_LABEL")}
        className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="project-releases-workflow-links"
      >
        {props.links.map((link) => {
          const Icon = link.icon;
          return (
            <a
              key={link.id}
              href={link.href}
              className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted"
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-label-secondary" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-footnote font-medium text-label-primary">
                  {link.label}
                </span>
                <span className="mt-1 line-clamp-2 block text-caption1 text-label-secondary">
                  {link.description}
                </span>
              </span>
            </a>
          );
        })}
      </nav>
    </section>
  );
}

function ReleaseRow(props: {
  canRollback: boolean;
  formatDateTime: (value: string | null | undefined) => string;
  onRollback: (release: AdminRelease) => void;
  pending: boolean;
  release: AdminRelease;
}) {
  const { t } = useTranslation("account");
  const canRollback =
    props.canRollback && !props.release.isActive && props.release.status !== "cancelled";

  return (
    <div className="grid gap-4 border-b border-border px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-headline font-semibold text-label-primary">
              {t("SETTINGS_PROJECT_RELEASES_RELEASE_NUMBER", {
                count: props.release.releaseNumber,
              })}
            </span>
            <ReleaseStatusTag release={props.release} />
            {props.release.isActive ? (
              <BaseTag color="green">{t("SETTINGS_PROJECT_RELEASES_ACTIVE")}</BaseTag>
            ) : null}
            {props.release.lineage?.parentReleaseNumber ? (
              <BaseTag color="default">
                {t("SETTINGS_PROJECT_RELEASES_PARENT", {
                  count: props.release.lineage.parentReleaseNumber,
                })}
              </BaseTag>
            ) : null}
          </div>

          <div className="grid gap-3 text-left sm:grid-cols-3">
            <div>
              <div className="text-footnote text-label-secondary">
                {t("SETTINGS_PROJECT_RELEASES_SELECTION_COUNT")}
              </div>
              <div className="mt-1 text-callout text-label-primary">
                {props.release.selectionCount ?? 0}
              </div>
            </div>
            <div>
              <div className="text-footnote text-label-secondary">
                {t("SETTINGS_PROJECT_RELEASES_CREATED")}
              </div>
              <div className="mt-1 text-callout text-label-primary">
                {props.formatDateTime(props.release.createdAt)}
              </div>
            </div>
            <div>
              <div className="text-footnote text-label-secondary">
                {t("SETTINGS_PROJECT_RELEASES_ACTIVATED")}
              </div>
              <div className="mt-1 text-callout text-label-primary">
                {props.formatDateTime(props.release.activatedAt)}
              </div>
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canRollback || props.pending}
          onClick={() => props.onRollback(props.release)}
          data-testid={`project-release-rollback-${props.release.id}`}
        >
          <RotateCcw size={16} />
          {t("SETTINGS_PROJECT_RELEASES_ROLLBACK")}
        </Button>
      </div>
    </div>
  );
}

function selectActiveRelease(releases: readonly AdminRelease[]): AdminRelease | null {
  return releases.find((release) => release.isActive) ?? null;
}

export function ProjectReleasesPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const { formatDateTime } = useAdminDateTimeFormatter({ projectId: props.projectId });
  const [rollbackTarget, setRollbackTarget] = useState<AdminRelease | null>(null);

  const releasesQuery = useQuery({
    queryKey: buildProjectReleasesQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectReleases(props.projectId),
  });

  const dryRunQuery = useQuery({
    queryKey: [...buildProjectReleasesQueryKey(props.projectId), "dry-run"],
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectReleaseDryRun(props.projectId),
    meta: { silent: true },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildProjectReleasesQueryKey(props.projectId),
    });
  };

  const publishMutation = useMutation({
    mutationFn: async () => publishProjectRelease(props.projectId),
    onSuccess: async (result) => {
      notifySuccessText(
        t("account:SETTINGS_PROJECT_RELEASES_PUBLISHED", {
          count: result.release.releaseNumber,
        }),
      );
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      if (!rollbackTarget) {
        throw new Error("ROLLBACK_RELEASE_REQUIRED");
      }
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
    onError: (error) => notifyError(error),
  });

  const permissionReady = permissionAccess.authzQuery.isFetched;
  const canPublish = permissionReady && permissionAccess.hasAction("project:release:publish");
  const canRollback = permissionReady && permissionAccess.hasAction("project:release:rollback");
  const releases = releasesQuery.data ?? [];
  const activeRelease = useMemo(() => selectActiveRelease(releases), [releases]);
  const workflowLinks = useMemo(
    () => buildProjectReleaseWorkflowLinks(props.projectId, t),
    [props.projectId, t],
  );
  const pending = publishMutation.isPending || rollbackMutation.isPending || dryRunQuery.isFetching;

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

        <section className="grid gap-4 border-y border-border bg-background py-5">
          <div className="flex flex-col gap-4 px-1 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 text-caption font-medium uppercase tracking-normal text-label-tertiary">
                <Rocket size={14} />
                {t("account:SETTINGS_PROJECT_RELEASES_READINESS_EYEBROW")}
              </div>
              <h2 className="text-title3 font-semibold text-label-primary">
                {activeRelease
                  ? t("account:SETTINGS_PROJECT_RELEASES_ACTIVE_RELEASE", {
                      count: activeRelease.releaseNumber,
                    })
                  : t("account:SETTINGS_PROJECT_RELEASES_NO_ACTIVE_RELEASE")}
              </h2>
              <p className="max-w-3xl text-callout text-label-secondary">
                {t("account:SETTINGS_PROJECT_RELEASES_READINESS_DESC")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={dryRunQuery.isFetching}
                disabled={publishMutation.isPending}
                onClick={() => void dryRunQuery.refetch()}
                data-testid="project-release-check"
              >
                <CheckCircle2 size={16} />
                {t("account:SETTINGS_PROJECT_RELEASES_CHECK")}
              </Button>
              <Button
                type="button"
                size="sm"
                loading={publishMutation.isPending}
                disabled={!canPublish || pending}
                onClick={() => void publishMutation.mutateAsync()}
                data-testid="project-release-publish"
              >
                <Rocket size={16} />
                {t("account:SETTINGS_PROJECT_RELEASES_PUBLISH")}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 px-1">
            <ReadinessOverview dryRun={dryRunQuery.data ?? null} pending={dryRunQuery.isFetching} />
            <ReleaseImpactDetails dryRun={dryRunQuery.data ?? null} />
          </div>
        </section>

        <ProjectReleaseWorkflowPanel
          activeRelease={activeRelease}
          dryRun={dryRunQuery.data ?? null}
          links={workflowLinks}
        />

        <section className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-headline font-semibold text-label-primary">
                <History size={16} />
                {t("account:SETTINGS_PROJECT_RELEASES_HISTORY_TITLE")}
              </div>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_RELEASES_HISTORY_DESC")}
              </p>
            </div>
            <BaseTag color="default">
              {t("account:SETTINGS_PROJECT_RELEASES_HISTORY_COUNT", {
                count: releases.length,
              })}
            </BaseTag>
          </div>

          {releases.length > 0 ? (
            <div
              className="overflow-hidden rounded-lg border border-border bg-card"
              data-testid="project-releases-list"
            >
              {releases.map((release) => (
                <ReleaseRow
                  key={release.id}
                  release={release}
                  pending={pending}
                  canRollback={canRollback}
                  formatDateTime={formatDateTime}
                  onRollback={setRollbackTarget}
                />
              ))}
            </div>
          ) : (
            <div
              className="grid gap-2 rounded-lg border border-dashed border-border bg-card px-5 py-8 text-callout text-label-secondary"
              data-testid="project-releases-empty-state"
            >
              <div className="flex items-center gap-2 text-headline text-label-primary">
                <Rocket size={16} />
                {t("account:SETTINGS_PROJECT_RELEASES_EMPTY_TITLE")}
              </div>
              <p>{t("account:SETTINGS_PROJECT_RELEASES_EMPTY_DESC")}</p>
            </div>
          )}
        </section>
      </div>
    </ContentGuard>
  );

  return (
    <>
      {props.embedded ? (
        content
      ) : (
        <DefaultPage
          title={t("account:SETTINGS_PROJECT_RELEASES_TITLE")}
          description={t("account:SETTINGS_PROJECT_RELEASES_DESC")}
          showFavoriteToggle={false}
          contentContainerClassName="min-h-full"
        >
          {content}
        </DefaultPage>
      )}

      <SettingDialog
        open={Boolean(rollbackTarget)}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
        title={t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK_DIALOG_TITLE")}
        description={t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK_DIALOG_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={rollbackMutation.isPending}
              onClick={() => setRollbackTarget(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              loading={rollbackMutation.isPending}
              disabled={!rollbackTarget}
              onClick={() => void rollbackMutation.mutateAsync()}
              data-testid="project-release-rollback-confirm"
            >
              <RotateCcw size={16} />
              {t("account:SETTINGS_PROJECT_RELEASES_ROLLBACK")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields className="py-2">
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
            <div className="rounded-md border border-border bg-background px-3 py-2 text-callout text-label-primary">
              {rollbackTarget
                ? t("account:SETTINGS_PROJECT_RELEASES_RELEASE_NUMBER", {
                    count: rollbackTarget.releaseNumber,
                  })
                : "-"}
            </div>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
