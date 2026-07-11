import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MoreVertical, PencilLine, Rocket, Server, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildProjectEnvironmentStateQueryKey,
  buildProjectEnvironmentsQueryKey,
  cloneProjectEnvironment,
  getProjectEnvironmentState,
  patchProjectEnvironment,
  promoteProjectEnvironment,
  switchProjectEnvironmentAlias,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@arclayer/ui/empty";
import { Input } from "@arclayer/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Switch } from "@arclayer/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

import type {
  ProjectDeploymentOut,
  ProjectEnvironmentAliasOut,
  ProjectEnvironmentOut,
} from "@arclayer/openapi";

type EnvironmentCopyOperation = {
  mode: "clone" | "promote";
  source: ProjectEnvironmentOut;
} | null;

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
  onCopy: (mode: "clone" | "promote", environment: ProjectEnvironmentOut) => void;
  onEdit: (environment: ProjectEnvironmentOut) => void;
  pending: boolean;
}) {
  const { t } = useTranslation(["account", "common"]);
  const deploymentLabel = props.activeDeployment
    ? `${props.activeDeployment.sourceType} • ${props.activeDeployment.artifactKey}`
    : t("account:SETTINGS_PROJECT_ENVIRONMENTS_DEPLOYMENT_EMPTY");

  return (
    <TableRow data-testid={`project-environment-row-${props.environment.key}`}>
      <TableCell className="px-4 py-4">
        <div className="font-medium text-label-primary">{props.environment.name}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-footnote text-label-secondary">
            {props.environment.key}
          </span>
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
          {!props.environment.isProduction && !props.environment.isDefaultPreview ? (
            <BaseTag color="default">
              {t("account:SETTINGS_PROJECT_ENVIRONMENTS_TAG_STANDARD")}
            </BaseTag>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="max-w-64 truncate text-label-primary">{deploymentLabel}</TableCell>
      <TableCell className="max-w-64 truncate text-label-primary">
        {props.domain?.hostname ?? t("account:SETTINGS_PROJECT_ENVIRONMENTS_DOMAIN_EMPTY")}
      </TableCell>
      <TableCell className="px-4 text-right">
        {props.canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("common:MORE")}
                disabled={props.pending}
              >
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuIconItem
                icon={<PencilLine className="size-4" />}
                onSelect={() => props.onEdit(props.environment)}
              >
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_EDIT")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Copy className="size-4" />}
                onSelect={() => props.onCopy("clone", props.environment)}
              >
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_CLONE")}
              </DropdownMenuIconItem>
              <DropdownMenuIconItem
                icon={<Rocket className="size-4" />}
                onSelect={() => props.onCopy("promote", props.environment)}
              >
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_PROMOTE")}
              </DropdownMenuIconItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function ProjectEnvironmentsPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [editingEnvironment, setEditingEnvironment] = useState<ProjectEnvironmentOut | null>(null);
  const [copyOperation, setCopyOperation] = useState<EnvironmentCopyOperation>(null);
  const [aliasToSwitch, setAliasToSwitch] = useState<ProjectEnvironmentAliasOut | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDefaultPreview, setDraftDefaultPreview] = useState(false);
  const [targetEnvironmentId, setTargetEnvironmentId] = useState("");
  const [includeContent, setIncludeContent] = useState(true);

  const environmentsQuery = useQuery({
    queryKey: buildProjectEnvironmentStateQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => getProjectEnvironmentState(props.projectId),
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

  const invalidateEnvironments = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildProjectEnvironmentsQueryKey(props.projectId),
    });
  };

  const copyMutation = useMutation({
    mutationFn: async () => {
      if (!copyOperation || !targetEnvironmentId) {
        throw new Error("ENVIRONMENT_COPY_TARGET_REQUIRED");
      }
      const payload = {
        source: copyOperation.source.id,
        target: targetEnvironmentId,
        includeContent,
      };
      return copyOperation.mode === "clone"
        ? cloneProjectEnvironment(props.projectId, payload)
        : promoteProjectEnvironment(props.projectId, payload);
    },
    onSuccess: async (result) => {
      notifySuccessText(
        t("account:SETTINGS_PROJECT_ENVIRONMENTS_COPY_SUCCESS", {
          models: result.contentModels,
          items: result.contentItems,
          versions: result.contentVersions,
        }),
      );
      setCopyOperation(null);
      await invalidateEnvironments();
    },
    onError: (error) => notifyError(error),
  });

  const aliasMutation = useMutation({
    mutationFn: async () => {
      if (!aliasToSwitch || !targetEnvironmentId) {
        throw new Error("ENVIRONMENT_ALIAS_TARGET_REQUIRED");
      }
      return switchProjectEnvironmentAlias(props.projectId, aliasToSwitch.key, {
        targetEnvironmentId,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_SAVED"));
      setAliasToSwitch(null);
      await invalidateEnvironments();
    },
    onError: (error) => notifyError(error),
  });

  const environments = environmentsQuery.data?.items ?? [];
  const aliases = environmentsQuery.data?.aliases ?? [];
  const pending = patchMutation.isPending || copyMutation.isPending || aliasMutation.isPending;

  const content = (
    <ContentGuard
      loading={environmentsQuery.isLoading}
      loadingVariant="form"
      error={environmentsQuery.error}
      onRetry={environmentsQuery.isError ? () => void environmentsQuery.refetch() : undefined}
    >
      <div className="grid gap-4">
        {permissionReady && !canManage ? (
          <AccessNoticeAlert
            data-testid="project-environments-read-only-notice"
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_READ_ONLY_DESC")}
          />
        ) : null}

        {permissionReady && environments.length === 0 ? (
          <Empty className="min-h-72" data-testid="project-environments-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Server />
              </EmptyMedia>
              <EmptyTitle>{t("account:SETTINGS_PROJECT_ENVIRONMENTS_EMPTY_TITLE")}</EmptyTitle>
              <EmptyDescription>
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_EMPTY_DESC")}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">
                    {t("account:SETTINGS_PROJECT_ENVIRONMENTS_TITLE")}
                  </TableHead>
                  <TableHead>
                    {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ACTIVE_DEPLOYMENT")}
                  </TableHead>
                  <TableHead>{t("account:SETTINGS_PROJECT_ENVIRONMENTS_PRIMARY_DOMAIN")}</TableHead>
                  <TableHead className="px-4 text-right">
                    {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ACTIONS")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {environments.map((environment) => (
                  <EnvironmentRow
                    key={environment.id}
                    environment={environment}
                    activeDeployment={resolveActiveDeployment(
                      deploymentsQuery.data ?? [],
                      environment.id,
                    )}
                    canManage={canManage}
                    domain={environment.isProduction ? primaryDomain : null}
                    onCopy={(mode, source) => {
                      setCopyOperation({ mode, source });
                      setTargetEnvironmentId("");
                      setIncludeContent(true);
                    }}
                    onEdit={setEditingEnvironment}
                    pending={pending}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {aliases.length > 0 ? (
          <section aria-labelledby="project-environment-aliases-title" className="space-y-3 pt-2">
            <div>
              <h2
                id="project-environment-aliases-title"
                className="font-heading text-base font-semibold text-foreground"
              >
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIASES_TITLE")}
              </h2>
              <p className="mt-1 text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIASES_DESC")}
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4">
                      {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS")}
                    </TableHead>
                    <TableHead>{t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_TARGET")}</TableHead>
                    <TableHead className="px-4 text-right">
                      {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ACTIONS")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliases.map((alias) => (
                    <TableRow key={alias.id} data-testid={`project-environment-alias-${alias.key}`}>
                      <TableCell className="px-4 py-3">
                        <div className="font-medium text-label-primary">{alias.name}</div>
                        <div className="mt-1 font-mono text-footnote text-label-secondary">
                          {alias.key}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-label-primary">{alias.targetEnvironmentName}</span>
                        <span className="ml-2 font-mono text-footnote text-label-secondary">
                          {alias.targetEnvironmentKey}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 text-right">
                        {canManage ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setAliasToSwitch(alias);
                              setTargetEnvironmentId(alias.targetEnvironmentId);
                            }}
                          >
                            {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_SWITCH")}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}
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
        preventInitialFocus={false}
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

      <SettingDialog
        open={Boolean(copyOperation)}
        onOpenChange={(open) => {
          if (!open) setCopyOperation(null);
        }}
        preventInitialFocus={false}
        title={
          copyOperation?.mode === "promote"
            ? t("account:SETTINGS_PROJECT_ENVIRONMENTS_PROMOTE_TITLE")
            : t("account:SETTINGS_PROJECT_ENVIRONMENTS_CLONE_TITLE")
        }
        description={
          copyOperation?.mode === "promote"
            ? t("account:SETTINGS_PROJECT_ENVIRONMENTS_PROMOTE_DESC")
            : t("account:SETTINGS_PROJECT_ENVIRONMENTS_CLONE_DESC")
        }
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={copyMutation.isPending}
              onClick={() => setCopyOperation(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              variant={copyOperation?.mode === "promote" ? "destructive" : "default"}
              disabled={!copyOperation || !targetEnvironmentId}
              loading={copyMutation.isPending}
              onClick={() => void copyMutation.mutateAsync()}
            >
              {copyOperation?.mode === "promote"
                ? t("account:SETTINGS_PROJECT_ENVIRONMENTS_PROMOTE_CONFIRM")
                : t("account:SETTINGS_PROJECT_ENVIRONMENTS_CLONE_CONFIRM")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_SOURCE")}
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_SOURCE_DESC")}
          >
            <div className="font-medium text-label-primary">{copyOperation?.source.name}</div>
            <div className="font-mono text-footnote text-label-secondary">
              {copyOperation?.source.key}
            </div>
          </SettingDialogField>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_TARGET")}
            description={
              copyOperation?.mode === "promote"
                ? t("account:SETTINGS_PROJECT_ENVIRONMENTS_PROMOTE_TARGET_DESC")
                : t("account:SETTINGS_PROJECT_ENVIRONMENTS_CLONE_TARGET_DESC")
            }
          >
            <Select value={targetEnvironmentId} onValueChange={setTargetEnvironmentId}>
              <SelectTrigger
                className="w-full"
                aria-label={t("account:SETTINGS_PROJECT_ENVIRONMENTS_TARGET")}
              >
                <SelectValue
                  placeholder={t("account:SETTINGS_PROJECT_ENVIRONMENTS_TARGET_PLACEHOLDER")}
                />
              </SelectTrigger>
              <SelectContent position="popper">
                {environments
                  .filter((environment) => environment.id !== copyOperation?.source.id)
                  .map((environment) => (
                    <SelectItem key={environment.id} value={environment.id}>
                      {environment.name} ({environment.key})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_INCLUDE_CONTENT")}
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_INCLUDE_CONTENT_DESC")}
          >
            <Switch
              aria-label={t("account:SETTINGS_PROJECT_ENVIRONMENTS_INCLUDE_CONTENT")}
              checked={includeContent}
              onCheckedChange={setIncludeContent}
            />
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>

      <SettingDialog
        open={Boolean(aliasToSwitch)}
        onOpenChange={(open) => {
          if (!open) setAliasToSwitch(null);
        }}
        preventInitialFocus={false}
        title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_SWITCH_TITLE")}
        description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_SWITCH_DESC", {
          alias: aliasToSwitch?.name,
        })}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={aliasMutation.isPending}
              onClick={() => setAliasToSwitch(null)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              disabled={
                !aliasToSwitch ||
                !targetEnvironmentId ||
                targetEnvironmentId === aliasToSwitch.targetEnvironmentId
              }
              loading={aliasMutation.isPending}
              onClick={() => void aliasMutation.mutateAsync()}
            >
              {t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_SWITCH_CONFIRM")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_TARGET")}
            description={t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_TARGET_DESC")}
          >
            <Select value={targetEnvironmentId} onValueChange={setTargetEnvironmentId}>
              <SelectTrigger
                className="w-full"
                aria-label={t("account:SETTINGS_PROJECT_ENVIRONMENTS_ALIAS_TARGET")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {environments.map((environment) => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name} ({environment.key})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
