import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Filter, RotateCcw, Rocket, SquareX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildProjectDeploymentsQueryKey,
  cancelProjectDeployment,
  listProjectDeployments,
  promoteProjectDeployment,
  rollbackProjectDeployment,
} from "@/api/project-deployments";
import {
  buildProjectEnvironmentsQueryKey,
  listProjectEnvironments,
} from "@/api/project-environments";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";

import type { ProjectDeploymentOut } from "@arclayer/openapi";

const DEPLOYMENT_STATUS_VALUES = [
  "queued",
  "building",
  "ready",
  "failed",
  "canceled",
  "promoted",
] as const;

type ActionDialogState = {
  deployment: ProjectDeploymentOut;
  mode: "promote" | "rollback";
} | null;

function DeploymentStatusTag(props: { status: string }) {
  const { t } = useTranslation("account");
  const color =
    props.status === "ready"
      ? "green"
      : props.status === "failed"
        ? "red"
        : props.status === "promoted"
          ? "blue"
          : props.status === "queued" || props.status === "building"
            ? "gold"
            : "default";
  return (
    <BaseTag color={color}>
      {t(`SETTINGS_PROJECT_DEPLOYMENTS_STATUS_${props.status.toUpperCase()}`)}
    </BaseTag>
  );
}

function DeploymentRow(props: {
  canCancel: boolean;
  canPromote: boolean;
  canRollback: boolean;
  deployment: ProjectDeploymentOut;
  formatDateTime: (value: string | null | undefined) => string;
  onCancel: (deployment: ProjectDeploymentOut) => void;
  onOpenAction: (mode: "promote" | "rollback", deployment: ProjectDeploymentOut) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("account");
  const failureReason =
    (props.deployment as ProjectDeploymentOut & { errorReason?: string | null }).errorReason ??
    null;
  const canOpenPromote =
    props.canPromote && props.deployment.status === "ready" && !props.deployment.isActive;
  const canOpenRollback =
    props.canRollback &&
    (props.deployment.status === "ready" || props.deployment.status === "promoted");
  const canOpenCancel =
    props.canCancel &&
    (props.deployment.status === "queued" || props.deployment.status === "building") &&
    !props.deployment.isActive;

  return (
    <div
      className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-4"
      data-testid={`project-deployment-row-${props.deployment.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {props.deployment.environmentName}
            </span>
            <DeploymentStatusTag status={props.deployment.status} />
            <BaseTag color="default">{props.deployment.sourceType}</BaseTag>
            <BaseTag color="default">{props.deployment.runtimeKind}</BaseTag>
            {props.deployment.isActive ? (
              <BaseTag color="green">{t("account:SETTINGS_PROJECT_DEPLOYMENTS_ACTIVE")}</BaseTag>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm text-label-secondary md:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DEPLOYMENTS_ENVIRONMENT")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.deployment.environmentKey}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DEPLOYMENTS_ARTIFACT")}
              </div>
              <div className="mt-1 truncate text-label-primary">{props.deployment.artifactKey}</div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DEPLOYMENTS_SOURCE_REF")}
              </div>
              <div className="mt-1 truncate text-label-primary">{props.deployment.sourceRef}</div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DEPLOYMENTS_CREATED")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.formatDateTime(props.deployment.createdAt)}
              </div>
            </div>
          </div>
          {failureReason ? (
            <div className="rounded-lg border border-red-200/70 bg-red-50/80 px-3 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
              {failureReason}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {props.deployment.buildLogKey ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.pending}
              onClick={() =>
                window.open(props.deployment.buildLogKey || "", "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink size={16} />
              {t("account:SETTINGS_PROJECT_DEPLOYMENTS_BUILD_LOG")}
            </Button>
          ) : null}
          {canOpenPromote ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onOpenAction("promote", props.deployment)}
            >
              <Rocket size={16} />
              {t("account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE")}
            </Button>
          ) : null}
          {canOpenRollback ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onOpenAction("rollback", props.deployment)}
            >
              <RotateCcw size={16} />
              {t("account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLBACK")}
            </Button>
          ) : null}
          {canOpenCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={props.pending}
              onClick={() => props.onCancel(props.deployment)}
            >
              <SquareX size={16} />
              {t("account:SETTINGS_PROJECT_DEPLOYMENTS_CANCEL")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProjectDeploymentsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const { formatDateTime } = useAdminDateTimeFormatter({ projectId: props.projectId });
  const [environmentFilter, setEnvironmentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionDialog, setActionDialog] = useState<ActionDialogState>(null);
  const [targetEnvironmentId, setTargetEnvironmentId] = useState<string>("");

  const environmentsQuery = useQuery({
    queryKey: buildProjectEnvironmentsQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectEnvironments(props.projectId),
  });

  const deploymentsQuery = useQuery({
    queryKey: [
      ...buildProjectDeploymentsQueryKey(props.projectId),
      environmentFilter,
      statusFilter,
    ],
    enabled: Boolean(props.projectId),
    queryFn: async () =>
      listProjectDeployments(props.projectId, {
        environmentId: environmentFilter === "all" ? null : environmentFilter,
        status: statusFilter === "all" ? null : statusFilter,
      }),
  });

  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canPromote = permissionReady && permissionAccess.hasAction("project:deployments:promote");
  const canRollback = permissionReady && permissionAccess.hasAction("project:deployments:rollback");
  const canManage = permissionReady && permissionAccess.hasAction("project:deployments:manage");
  const canOperate = canPromote || canRollback || canManage;

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildProjectDeploymentsQueryKey(props.projectId),
    });
  };

  const promoteMutation = useMutation({
    mutationFn: async () => {
      if (!actionDialog || actionDialog.mode !== "promote") {
        throw new Error("PROMOTE_TARGET_REQUIRED");
      }
      return promoteProjectDeployment(props.projectId, actionDialog.deployment.id, {
        environmentId: targetEnvironmentId,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTED"));
      setActionDialog(null);
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      if (!actionDialog || actionDialog.mode !== "rollback") {
        throw new Error("ROLLBACK_TARGET_REQUIRED");
      }
      return rollbackProjectDeployment(props.projectId, actionDialog.deployment.id, {
        environmentId: targetEnvironmentId,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLED_BACK"));
      setActionDialog(null);
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const cancelMutation = useMutation({
    mutationFn: async (deployment: ProjectDeploymentOut) =>
      cancelProjectDeployment(props.projectId, deployment.id),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DEPLOYMENTS_CANCELED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const pending =
    promoteMutation.isPending || rollbackMutation.isPending || cancelMutation.isPending;
  const environments = environmentsQuery.data ?? [];
  const deployments = deploymentsQuery.data ?? [];
  const activeDialogTitle =
    actionDialog?.mode === "promote"
      ? t("account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE_DIALOG_TITLE")
      : t("account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLBACK_DIALOG_TITLE");
  const activeDialogDescription =
    actionDialog?.mode === "promote"
      ? t("account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE_DIALOG_DESC")
      : t("account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLBACK_DIALOG_DESC");

  const content = (
    <ContentGuard
      loading={deploymentsQuery.isLoading || environmentsQuery.isLoading}
      loadingVariant="table"
      error={deploymentsQuery.error ?? environmentsQuery.error}
      onRetry={
        deploymentsQuery.isError || environmentsQuery.isError
          ? () => {
              void deploymentsQuery.refetch();
              void environmentsQuery.refetch();
            }
          : undefined
      }
      empty={permissionReady && deployments.length === 0}
      emptyTitle={t("account:SETTINGS_PROJECT_DEPLOYMENTS_EMPTY_TITLE")}
      emptyDescription={t("account:SETTINGS_PROJECT_DEPLOYMENTS_EMPTY_DESC")}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-4">
          <BaseTag color="default" icon={lucideTagIcon(Filter)}>
            {t("account:SETTINGS_PROJECT_DEPLOYMENTS_FILTERS")}
          </BaseTag>
          <select
            aria-label={t("account:SETTINGS_PROJECT_DEPLOYMENTS_FILTER_ENV")}
            className="h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={environmentFilter}
            onChange={(event) => setEnvironmentFilter(event.target.value)}
          >
            <option value="all">{t("account:SETTINGS_PROJECT_DEPLOYMENTS_FILTER_ENV_ALL")}</option>
            {environments.map((environment) => (
              <option key={environment.id} value={environment.id}>
                {environment.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("account:SETTINGS_PROJECT_DEPLOYMENTS_FILTER_STATUS")}
            className="h-10 min-w-[220px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">
              {t("account:SETTINGS_PROJECT_DEPLOYMENTS_FILTER_STATUS_ALL")}
            </option>
            {DEPLOYMENT_STATUS_VALUES.map((status) => (
              <option key={status} value={status}>
                {t(`account:SETTINGS_PROJECT_DEPLOYMENTS_STATUS_${status.toUpperCase()}`)}
              </option>
            ))}
          </select>
        </div>

        {permissionReady && !canOperate ? (
          <AccessNoticeAlert
            data-testid="project-deployments-read-only-notice"
            description={t("account:SETTINGS_PROJECT_DEPLOYMENTS_READ_ONLY_DESC")}
          />
        ) : null}

        {deployments.map((deployment) => (
          <DeploymentRow
            key={deployment.id}
            deployment={deployment}
            canPromote={canPromote}
            canRollback={canRollback}
            canCancel={canManage}
            formatDateTime={formatDateTime}
            pending={pending}
            onCancel={(next) => {
              void cancelMutation.mutateAsync(next);
            }}
            onOpenAction={(mode, deploymentTarget) => {
              setActionDialog({ mode, deployment: deploymentTarget });
              setTargetEnvironmentId(deploymentTarget.environmentId);
            }}
          />
        ))}
      </div>
    </ContentGuard>
  );

  return (
    <>
      {props.embedded ? (
        content
      ) : (
        <DefaultPage
          title={t("account:SETTINGS_PROJECT_DEPLOYMENTS_TITLE")}
          description={t("account:SETTINGS_PROJECT_DEPLOYMENTS_DESC")}
          showFavoriteToggle={false}
          pageFrame="full"
          largeViewportGutters={false}
          className="min-h-full"
          contentClassName="min-h-full"
          contentContainerClassName="min-h-full"
        >
          {content}
        </DefaultPage>
      )}

      <SettingDialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open) setActionDialog(null);
        }}
        title={activeDialogTitle}
        description={activeDialogDescription}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setActionDialog(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              disabled={!targetEnvironmentId}
              loading={pending}
              onClick={() => {
                if (actionDialog?.mode === "promote") {
                  void promoteMutation.mutateAsync();
                  return;
                }
                if (actionDialog?.mode === "rollback") {
                  void rollbackMutation.mutateAsync();
                }
              }}
            >
              {actionDialog?.mode === "promote"
                ? t("account:SETTINGS_PROJECT_DEPLOYMENTS_PROMOTE")
                : t("account:SETTINGS_PROJECT_DEPLOYMENTS_ROLLBACK")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_DEPLOYMENTS_TARGET_ENVIRONMENT")}
            description={t("account:SETTINGS_PROJECT_DEPLOYMENTS_TARGET_ENVIRONMENT_DESC")}
          >
            <select
              aria-label={t("account:SETTINGS_PROJECT_DEPLOYMENTS_TARGET_ENVIRONMENT")}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
              value={targetEnvironmentId}
              onChange={(event) => setTargetEnvironmentId(event.target.value)}
            >
              <option value="" disabled>
                {t("account:SETTINGS_PROJECT_DEPLOYMENTS_TARGET_ENVIRONMENT")}
              </option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.name}
                </option>
              ))}
            </select>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
