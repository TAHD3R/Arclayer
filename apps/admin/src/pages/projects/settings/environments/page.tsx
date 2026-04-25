import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, PencilLine, Rocket, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildProjectEnvironmentsQueryKey,
  listProjectEnvironments,
  patchProjectEnvironment,
} from "@/api/project-environments";
import { buildProjectDeploymentsQueryKey, listProjectDeployments } from "@/api/project-deployments";
import { listProjectDomains, type ProjectDomainBinding } from "@/api/project-settings";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { Input } from "@arclayer/ui/input";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";

import type { ProjectDeploymentOut, ProjectEnvironmentOut } from "@arclayer/openapi";

function resolvePrimaryDomain(domains: ProjectDomainBinding[]): ProjectDomainBinding | null {
  return (
    domains.find((domain) => domain.isActive && domain.isVerified) ??
    domains.find((domain) => domain.isActive) ??
    domains.find((domain) => domain.isVerified) ??
    null
  );
}

function resolveActiveDeployment(
  deployments: ProjectDeploymentOut[],
  environmentId: string,
): ProjectDeploymentOut | null {
  return (
    deployments.find(
      (deployment) => deployment.environmentId === environmentId && deployment.isActive,
    ) ?? null
  );
}

function EnvironmentRow(props: {
  activeDeployment: ProjectDeploymentOut | null;
  canManage: boolean;
  domain: ProjectDomainBinding | null;
  environment: ProjectEnvironmentOut;
  onEdit: (environment: ProjectEnvironmentOut) => void;
  pending: boolean;
}) {
  const { t } = useTranslation(["account", "common"]);
  const deploymentLabel = props.activeDeployment
    ? `${props.activeDeployment.sourceType} • ${props.activeDeployment.artifactKey}`
    : t("account:SETTINGS_PROJECT_ENVIRONMENTS_DEPLOYMENT_EMPTY");

  return (
    <div
      className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-4"
      data-testid={`project-environment-row-${props.environment.key}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{props.environment.name}</span>
            <BaseTag color="default">{props.environment.key}</BaseTag>
            {props.environment.isProduction ? (
              <BaseTag color="green" icon={lucideTagIcon(Star)}>
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_TAG_PRODUCTION")}
              </BaseTag>
            ) : null}
            {props.environment.isDefaultPreview ? (
              <BaseTag color="blue">
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_TAG_DEFAULT_PREVIEW")}
              </BaseTag>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm text-label-secondary md:grid-cols-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-caption uppercase text-label-secondary">
                <Rocket size={14} />
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ACTIVE_DEPLOYMENT")}
              </div>
              <div className="mt-1 truncate text-label-primary">{deploymentLabel}</div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-caption uppercase text-label-secondary">
                <Globe size={14} />
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_PRIMARY_DOMAIN")}
              </div>
              <div className="mt-1 truncate text-label-primary">
                {props.domain?.hostname ?? t("account:SETTINGS_PROJECT_ENVIRONMENTS_DOMAIN_EMPTY")}
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_IDENTITY")}
              </div>
              <div className="mt-1 truncate text-label-primary">{props.environment.id}</div>
            </div>
          </div>
        </div>

        {props.canManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={props.pending}
            onClick={() => props.onEdit(props.environment)}
          >
            <PencilLine size={16} />
            {t("account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectEnvironmentsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [editingEnvironment, setEditingEnvironment] = useState<ProjectEnvironmentOut | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDefaultPreview, setDraftDefaultPreview] = useState(false);

  const environmentsQuery = useQuery({
    queryKey: buildProjectEnvironmentsQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectEnvironments(props.projectId),
  });

  const deploymentsQuery = useQuery({
    queryKey: [...buildProjectDeploymentsQueryKey(props.projectId), "active-environment-links"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDeployments(props.projectId),
    retry: false,
    meta: { silent: true },
  });

  const domainsQuery = useQuery({
    queryKey: ["project", "domains", props.projectId, "environment-links"],
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDomains(props.projectId),
    retry: false,
    meta: { silent: true },
  });

  useEffect(() => {
    if (!editingEnvironment) return;
    setDraftName(editingEnvironment.name);
    setDraftDefaultPreview(Boolean(editingEnvironment.isDefaultPreview));
  }, [editingEnvironment]);

  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManage = permissionReady && permissionAccess.hasAction("project:settings:manage");
  const primaryDomain = useMemo(
    () => resolvePrimaryDomain(domainsQuery.data ?? []),
    [domainsQuery.data],
  );

  const patchMutation = useMutation({
    mutationFn: async (environment: ProjectEnvironmentOut) =>
      patchProjectEnvironment(props.projectId, environment.id, {
        name: draftName.trim(),
        isDefaultPreview: draftDefaultPreview,
      }),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_ENVIRONMENTS_SAVED"));
      setEditingEnvironment(null);
      await queryClient.invalidateQueries({
        queryKey: buildProjectEnvironmentsQueryKey(props.projectId),
      });
    },
    onError: (error) => notifyError(error),
  });

  const environments = environmentsQuery.data ?? [];

  const content = (
    <ContentGuard
      loading={environmentsQuery.isLoading}
      loadingVariant="form"
      error={environmentsQuery.error}
      onRetry={environmentsQuery.isError ? () => void environmentsQuery.refetch() : undefined}
      empty={permissionReady && environments.length === 0}
      emptyTitle={t("account:SETTINGS_PROJECT_ENVIRONMENTS_EMPTY_TITLE")}
      emptyDescription={t("account:SETTINGS_PROJECT_ENVIRONMENTS_EMPTY_DESC")}
    >
      <div className="grid gap-4">
        {permissionReady && !canManage ? (
          <AccessNoticeAlert
            data-testid="project-environments-read-only-notice"
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_READ_ONLY_DESC")}
          />
        ) : null}

        {environments.map((environment) => (
          <EnvironmentRow
            key={environment.id}
            environment={environment}
            activeDeployment={resolveActiveDeployment(deploymentsQuery.data ?? [], environment.id)}
            canManage={canManage}
            domain={environment.isProduction ? primaryDomain : null}
            onEdit={setEditingEnvironment}
            pending={patchMutation.isPending}
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
          title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_TITLE")}
          description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_DESC")}
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
        open={Boolean(editingEnvironment)}
        onOpenChange={(open) => {
          if (!open) setEditingEnvironment(null);
        }}
        title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT_TITLE")}
        description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={patchMutation.isPending}
              onClick={() => setEditingEnvironment(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              disabled={!editingEnvironment || draftName.trim().length === 0}
              loading={patchMutation.isPending}
              onClick={() => {
                if (editingEnvironment) {
                  void patchMutation.mutateAsync(editingEnvironment);
                }
              }}
            >
              {t("account:SETTINGS_PROJECT_ENVIRONMENTS_SAVE")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_NAME_LABEL")}
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_NAME_DESC")}
          >
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={t("account:SETTINGS_PROJECT_ENVIRONMENTS_NAME_PLACEHOLDER")}
            />
          </SettingDialogField>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_DEFAULT_PREVIEW_LABEL")}
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_DEFAULT_PREVIEW_DESC")}
          >
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-3">
              <div className="text-sm text-label-secondary">
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_DEFAULT_PREVIEW_HELPER")}
              </div>
              <Switch checked={draftDefaultPreview} onCheckedChange={setDraftDefaultPreview} />
            </div>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
