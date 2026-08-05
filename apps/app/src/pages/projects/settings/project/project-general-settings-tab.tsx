import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { getProjectDetail, patchProject } from "@/api/projects";
import { AccessNoticeAlert } from "@/components/common/access-notice-alert";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import {
  ProjectIconDialog,
  type ProjectIconDialogProject,
} from "@/pages/usercenter/projects/components/project-icon-dialog";
import type { ProjectIconDialogValues } from "@/pages/usercenter/projects/hooks/use-project-menu-actions";
import type { ProjectUpdateRequest as ProjectUpdateInput } from "@arclayer/openapi";
import { Alert, AlertDescription } from "@arclayer/ui/alert";
import { useSavingKey } from "@arclayer/hooks/use-saving-key";

import { ProjectContextRail, type ProjectAccessState } from "./project-context-rail";
import { ProjectDangerZone } from "./project-danger-zone";
import { ProjectIdentityPanel } from "./project-identity-panel";

function buildProjectIconDialogValues(
  project: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>["project"],
): ProjectIconDialogValues {
  return {
    iconMode: project.iconMode,
    iconColor: project.iconColor,
    iconGlyph: project.iconGlyph ?? null,
    iconEmoji: project.iconEmoji ?? null,
    iconUrl: project.iconUrl ?? null,
  };
}

function buildProjectIconPatch(values: ProjectIconDialogValues): ProjectUpdateInput {
  return {
    iconMode: values.iconMode,
    iconColor: values.iconColor,
    iconGlyph: values.iconMode === "glyph" ? values.iconGlyph : null,
    iconEmoji: values.iconMode === "emoji" ? values.iconEmoji : null,
    iconUrl: values.iconMode === "image" ? values.iconUrl : null,
  };
}

export function ProjectGeneralSettingsTab(props: { projectId: string }) {
  const { projectId } = props;
  const { t } = useTranslation(["account", "settings"]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { savingKey, withSavingKey } = useSavingKey();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const [iconDialogProject, setIconDialogProject] = useState<ProjectIconDialogProject | null>(null);
  const [iconDialogValues, setIconDialogValues] = useState<ProjectIconDialogValues>({
    iconMode: "initials",
    iconColor: "#337ea9",
    iconGlyph: null,
    iconEmoji: null,
    iconUrl: null,
  });

  const detailQuery = useQuery({
    queryKey: ["project", "detail", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => getProjectDetail(projectId),
    retry: false,
    meta: { silent: true },
  });
  const updateProjectMutation = useMutation({
    mutationFn: async (patch: ProjectUpdateInput) => patchProject(projectId, patch),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", "detail", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["global-nav", "projects"] }),
        queryClient.invalidateQueries({ queryKey: ["dataTable"] }),
      ]);
    },
    onError: (error) => notifyError(error),
  });

  const permissionReady =
    permissionAccess.authzQuery.isFetched && permissionAccess.actionsQuery.isFetched;
  const permissionFailed =
    permissionAccess.authzQuery.isError || permissionAccess.actionsQuery.isError;
  const canManageProject =
    permissionReady && !permissionFailed && permissionAccess.hasAction("project:settings:manage");
  const accessState: ProjectAccessState = permissionFailed
    ? "error"
    : !permissionReady
      ? "loading"
      : canManageProject
        ? "manage"
        : "read-only";

  const leaveProjectSettings = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["projects-cards"] });
    await navigate({ to: "/projects" });
  }, [navigate, queryClient]);

  const loadError = detailQuery.isError
    ? detailQuery.error
    : !detailQuery.isLoading && !detailQuery.data
      ? new Error(t("settings:SETTINGS_LOAD_FAILED_DESC"))
      : null;
  const project = detailQuery.data?.project ?? null;

  return (
    <ContentGuard
      loading={detailQuery.isLoading && !detailQuery.data}
      loadingVariant="form"
      error={loadError}
      onRetry={loadError ? () => void detailQuery.refetch() : undefined}
    >
      {project ? (
        <>
          {permissionReady && !permissionFailed && !canManageProject ? (
            <AccessNoticeAlert
              className="mb-6"
              description={t("account:SETTINGS_PROJECT_READ_ONLY_DESC")}
            />
          ) : null}
          {permissionFailed ? (
            <Alert variant="destructive" className="mb-6">
              <AlertDescription>
                {t("account:SETTINGS_PROJECT_PERMISSION_LOAD_ERROR")}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <ProjectIdentityPanel
              project={project}
              disabled={updateProjectMutation.isPending || !canManageProject}
              savePending={savingKey === "project:identity"}
              onEditIcon={() => {
                setIconDialogProject({ projectId: project.id, name: project.name });
                setIconDialogValues(buildProjectIconDialogValues(project));
              }}
              onSave={async (values) => {
                await withSavingKey("project:identity", async () => {
                  await updateProjectMutation.mutateAsync({
                    name: values.name,
                    description: values.description || null,
                  });
                });
                notifySuccessText(t("account:SETTINGS_PROJECT_IDENTITY_SAVED"));
              }}
            />
            <ProjectContextRail
              project={project}
              primaryRuntime={detailQuery.data?.primaryRuntime ?? null}
              accessState={accessState}
            />
          </div>

          <ProjectDangerZone
            projectId={projectId}
            projectName={project.name}
            canManageProject={canManageProject}
            onProjectRemoved={leaveProjectSettings}
          />

          {iconDialogProject ? (
            <ProjectIconDialog
              t={(key, options) => t(key, options)}
              dialog={{
                project: iconDialogProject,
                values: iconDialogValues,
                setValues: setIconDialogValues,
                pending: updateProjectMutation.isPending,
                onClose: () => setIconDialogProject(null),
                onConfirm: async () => {
                  await withSavingKey("project:icon", async () => {
                    await updateProjectMutation.mutateAsync(
                      buildProjectIconPatch(iconDialogValues),
                    );
                  });
                  notifySuccessText(t("account:SETTINGS_PROJECT_ICON_SAVED"));
                  setIconDialogProject(null);
                },
              }}
            />
          ) : null}
        </>
      ) : null}
    </ContentGuard>
  );
}
