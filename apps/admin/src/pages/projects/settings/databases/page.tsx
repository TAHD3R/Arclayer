import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  buildProjectDatabasesQueryKey,
  createProjectDatabase,
  listProjectDatabases,
  rotateProjectDatabaseCredential,
} from "@/api/project-databases";
import {
  buildProjectEnvironmentsQueryKey,
  listProjectEnvironments,
} from "@/api/project-environments";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { BaseTag, lucideTagIcon } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";

import type {
  ProjectDatabaseCredentialOut,
  ProjectDatabaseInstanceOut,
  ProjectEnvironmentOut,
} from "@arclayer/openapi";

function DatabaseStatusTag(props: { status: string }) {
  const { t } = useTranslation("account");
  const color = props.status === "ready" ? "green" : props.status === "failed" ? "red" : "gold";
  return (
    <BaseTag color={color}>
      {t(`SETTINGS_PROJECT_DATABASES_STATUS_${props.status.toUpperCase()}`)}
    </BaseTag>
  );
}

function buildMaskedConnectionString(
  database: ProjectDatabaseInstanceOut,
  credential: ProjectDatabaseCredentialOut | null,
): string {
  const username = credential?.username ?? "app";
  return `postgresql://${username}:********@${database.host}:${database.port}/${database.databaseName}`;
}

function DatabaseRow(props: {
  canManage: boolean;
  database: ProjectDatabaseInstanceOut;
  onRotate: (databaseId: string, role: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation("account");
  const appCredential =
    props.database.credentials?.find(
      (credential: ProjectDatabaseCredentialOut) => credential.role === "app",
    ) ??
    props.database.credentials?.[0] ??
    null;
  const maskedConnectionString = buildMaskedConnectionString(props.database, appCredential);

  return (
    <div
      className="rounded-[22px] border border-border/60 bg-background/80 px-4 py-4"
      data-testid={`project-database-row-${props.database.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {props.database.environmentName}
            </span>
            <DatabaseStatusTag status={props.database.status} />
            <BaseTag color="default">{props.database.engine}</BaseTag>
            <BaseTag color="default">{props.database.isolationMode}</BaseTag>
          </div>
          <div className="grid gap-2 text-sm text-label-secondary md:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DATABASES_HOST")}
              </div>
              <div className="mt-1 truncate text-label-primary">{props.database.host}</div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DATABASES_DATABASE_NAME")}
              </div>
              <div className="mt-1 truncate text-label-primary">{props.database.databaseName}</div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DATABASES_SCHEMA_NAME")}
              </div>
              <div className="mt-1 truncate text-label-primary">{props.database.schemaName}</div>
            </div>
            <div className="min-w-0">
              <div className="text-caption uppercase text-label-secondary">
                {t("account:SETTINGS_PROJECT_DATABASES_CONNECTION")}
              </div>
              <div className="mt-1 truncate text-label-primary">{maskedConnectionString}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(props.database.credentials ?? []).map((credential: ProjectDatabaseCredentialOut) => (
              <div
                key={`${props.database.id}-${credential.role}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
              >
                <BaseTag color="default">{credential.role}</BaseTag>
                <span className="text-sm text-label-secondary">{credential.username}</span>
                <BaseTag color={credential.secretSet ? "green" : "gold"}>
                  {credential.secretSet
                    ? t("account:SETTINGS_PROJECT_DATABASES_SECRET_SET")
                    : t("account:SETTINGS_PROJECT_DATABASES_SECRET_EMPTY")}
                </BaseTag>
                {props.canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={props.pending}
                    onClick={() => props.onRotate(props.database.id, credential.role)}
                  >
                    <KeyRound size={16} />
                    {t("account:SETTINGS_PROJECT_DATABASES_ROTATE")}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectDatabasesPage(props: { projectId: string; embedded?: boolean }) {
  const { t } = useTranslation(["account", "common"]);
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(props.projectId);
  const [createOpen, setCreateOpen] = useState(false);
  const [environmentId, setEnvironmentId] = useState("");

  const environmentsQuery = useQuery({
    queryKey: buildProjectEnvironmentsQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectEnvironments(props.projectId),
  });

  const databasesQuery = useQuery({
    queryKey: buildProjectDatabasesQueryKey(props.projectId),
    enabled: Boolean(props.projectId),
    queryFn: async () => listProjectDatabases(props.projectId),
  });

  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const canManage = permissionReady && permissionAccess.hasAction("project:settings:manage");
  const environments = environmentsQuery.data ?? [];
  const databases = useMemo(
    () =>
      [...(databasesQuery.data ?? [])].sort((left, right) =>
        left.environmentName.localeCompare(right.environmentName),
      ),
    [databasesQuery.data],
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildProjectDatabasesQueryKey(props.projectId),
    });
  };

  const createMutation = useMutation({
    mutationFn: async () =>
      createProjectDatabase(props.projectId, {
        environmentId,
        engine: "postgres",
        isolationMode: "database",
      }),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DATABASES_CREATED"));
      setCreateOpen(false);
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const rotateMutation = useMutation({
    mutationFn: async (input: { databaseId: string; role: string }) =>
      rotateProjectDatabaseCredential(props.projectId, input.databaseId, { role: input.role }),
    onSuccess: async () => {
      notifySuccessText(t("account:SETTINGS_PROJECT_DATABASES_ROTATED"));
      await invalidate();
    },
    onError: (error) => notifyError(error),
  });

  const createDatabaseButton = canManage ? (
    <Button
      type="button"
      onClick={() => {
        setEnvironmentId(environments[0]?.id ?? "");
        setCreateOpen(true);
      }}
    >
      <Plus size={16} />
      {t("account:SETTINGS_PROJECT_DATABASES_CREATE_ACTION")}
    </Button>
  ) : null;

  const content = (
    <ContentGuard
      loading={databasesQuery.isLoading || environmentsQuery.isLoading}
      loadingVariant="table"
      error={databasesQuery.error ?? environmentsQuery.error}
      onRetry={
        databasesQuery.isError || environmentsQuery.isError
          ? () => {
              void databasesQuery.refetch();
              void environmentsQuery.refetch();
            }
          : undefined
      }
      empty={permissionReady && databases.length === 0}
      emptyTitle={t("account:SETTINGS_PROJECT_DATABASES_EMPTY_TITLE")}
      emptyDescription={t("account:SETTINGS_PROJECT_DATABASES_EMPTY_DESC")}
      emptyExtra={props.embedded ? createDatabaseButton : undefined}
    >
      <div className="grid gap-4">
        {props.embedded && createDatabaseButton ? (
          <div className="flex justify-end">{createDatabaseButton}</div>
        ) : null}

        {permissionReady && !canManage ? (
          <AccessNoticeAlert
            data-testid="project-databases-read-only-notice"
            description={t("account:SETTINGS_PROJECT_DATABASES_READ_ONLY_DESC")}
          />
        ) : null}

        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-4 text-sm text-label-secondary">
          <BaseTag color="default" icon={lucideTagIcon(Database)}>
            {t("account:SETTINGS_PROJECT_DATABASES_MASKED")}
          </BaseTag>
          <span>{t("account:SETTINGS_PROJECT_DATABASES_MASKED_DESC")}</span>
        </div>

        {databases.map((database) => (
          <DatabaseRow
            key={database.id}
            database={database}
            canManage={canManage}
            pending={createMutation.isPending || rotateMutation.isPending}
            onRotate={(databaseId, role) => {
              void rotateMutation.mutateAsync({ databaseId, role });
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
          title={t("account:SETTINGS_PROJECT_DATABASES_TITLE")}
          description={t("account:SETTINGS_PROJECT_DATABASES_DESC")}
          showFavoriteToggle={false}
          pageFrame="full"
          className="min-h-full"
          contentClassName="min-h-full"
          contentContainerClassName="min-h-full"
          action={createDatabaseButton ?? undefined}
        >
          {content}
        </DefaultPage>
      )}

      <SettingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("account:SETTINGS_PROJECT_DATABASES_CREATE_TITLE")}
        description={t("account:SETTINGS_PROJECT_DATABASES_CREATE_DESC")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={createMutation.isPending}
              onClick={() => setCreateOpen(false)}
            >
              {t("common:CANCEL")}
            </Button>
            <Button
              type="button"
              disabled={!environmentId}
              loading={createMutation.isPending}
              onClick={() => {
                void createMutation.mutateAsync();
              }}
            >
              {t("account:SETTINGS_PROJECT_DATABASES_CREATE_SUBMIT")}
            </Button>
          </div>
        }
      >
        <SettingDialogFields className="py-2">
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT")}
            description={t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT_DESC")}
          >
            <select
              aria-label={t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT")}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
            >
              <option value="" disabled>
                {t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT")}
              </option>
              {environments.map((environment: ProjectEnvironmentOut) => (
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
