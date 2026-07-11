import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, KeyRound } from "lucide-react";
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
import { BaseTag } from "@/components/ui/tags";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@arclayer/ui/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@arclayer/ui/select";
import { SettingDialog } from "@arclayer/ui/setting-dialog";
import { SettingDialogField, SettingDialogFields } from "@arclayer/ui/setting-dialog-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@arclayer/ui/table";

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
    <TableRow data-testid={`project-database-row-${props.database.id}`}>
      <TableCell className="px-4 py-4">
        <div className="font-medium text-label-primary">{props.database.environmentName}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-footnote text-label-secondary">
            {props.database.environmentKey}
          </span>
          <DatabaseStatusTag status={props.database.status} />
        </div>
      </TableCell>
      <TableCell>
        <div className="font-medium text-label-primary">{props.database.databaseName}</div>
        <div className="mt-1 flex flex-wrap gap-2">
          <BaseTag color="default">{props.database.engine}</BaseTag>
          <BaseTag color="default">{props.database.isolationMode}</BaseTag>
        </div>
      </TableCell>
      <TableCell className="max-w-72">
        <div className="truncate text-label-primary">
          {props.database.host}:{props.database.port}
        </div>
        <code className="mt-1 block truncate font-mono text-footnote text-label-secondary">
          {maskedConnectionString}
        </code>
      </TableCell>
      <TableCell className="px-4">
        <div className="flex flex-col items-end gap-2">
          {(props.database.credentials ?? []).map((credential: ProjectDatabaseCredentialOut) => (
            <div
              key={`${props.database.id}-${credential.role}`}
              className="flex items-center gap-2"
            >
              <BaseTag color={credential.secretSet ? "green" : "gold"}>{credential.role}</BaseTag>
              <BaseTag color="default">
                {credential.secretSet
                  ? t("account:SETTINGS_PROJECT_DATABASES_SECRET_SET")
                  : t("account:SETTINGS_PROJECT_DATABASES_SECRET_EMPTY")}
              </BaseTag>
              <span className="max-w-36 truncate text-footnote text-label-secondary">
                {credential.username}
              </span>
              {props.canManage ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={props.pending}
                  onClick={() => props.onRotate(props.database.id, credential.role)}
                >
                  <KeyRound aria-hidden="true" />
                  {t("account:SETTINGS_PROJECT_DATABASES_ROTATE")}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </TableCell>
    </TableRow>
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
    >
      <div className="grid gap-4">
        {props.embedded && createDatabaseButton && databases.length > 0 ? (
          <div className="flex justify-end">{createDatabaseButton}</div>
        ) : null}

        {permissionReady && !canManage ? (
          <AccessNoticeAlert
            data-testid="project-databases-read-only-notice"
            description={t("account:SETTINGS_PROJECT_DATABASES_READ_ONLY_DESC")}
          />
        ) : null}

        {permissionReady && databases.length === 0 ? (
          <Empty className="min-h-72" data-testid="project-databases-empty">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Database />
              </EmptyMedia>
              <EmptyTitle>{t("account:SETTINGS_PROJECT_DATABASES_EMPTY_TITLE")}</EmptyTitle>
              <EmptyDescription>
                {t("account:SETTINGS_PROJECT_DATABASES_EMPTY_DESC")}
              </EmptyDescription>
            </EmptyHeader>
            {createDatabaseButton ? <EmptyContent>{createDatabaseButton}</EmptyContent> : null}
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4">
                    {t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT")}
                  </TableHead>
                  <TableHead>{t("account:SETTINGS_PROJECT_DATABASES_DATABASE_NAME")}</TableHead>
                  <TableHead>{t("account:SETTINGS_PROJECT_DATABASES_CONNECTION")}</TableHead>
                  <TableHead className="px-4 text-right">
                    {t("account:SETTINGS_PROJECT_DATABASES_CREDENTIALS")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
              </TableBody>
            </Table>
          </div>
        )}
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
        preventInitialFocus={false}
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
            <Select value={environmentId} onValueChange={setEnvironmentId}>
              <SelectTrigger
                id="project-database-environment"
                className="w-full"
                aria-label={t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT")}
              >
                <SelectValue
                  placeholder={t("account:SETTINGS_PROJECT_DATABASES_TARGET_ENVIRONMENT")}
                />
              </SelectTrigger>
              <SelectContent position="popper">
                {environments.map((environment: ProjectEnvironmentOut) => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingDialogField>
          <SettingDialogField
            title={t("account:SETTINGS_PROJECT_DATABASES_ENGINE")}
            description={t("account:SETTINGS_PROJECT_DATABASES_ENGINE_DESC")}
          >
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-3">
              <BaseTag color="default">PostgreSQL</BaseTag>
              <span className="text-footnote text-label-secondary">
                {t("account:SETTINGS_PROJECT_DATABASES_ISOLATION_DATABASE")}
              </span>
            </div>
          </SettingDialogField>
        </SettingDialogFields>
      </SettingDialog>
    </>
  );
}
