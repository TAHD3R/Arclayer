import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import {
  buildContentModelsQueryKey,
  createContentModel,
  deleteContentModel,
  listAllContentModels,
} from "@/api/content";
import { useProjectPermissionAccess } from "@/hooks/use-workspace-permission-access";
import { ContentGuard } from "@/layouts/page-shell/content-guard";
import { DefaultPage } from "@/layouts/page-shell/default-page";
import {
  projectContentModelsEditPath,
  projectContentModelsPath,
} from "@/lib/routing/project-content-routing";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";

import { ContentModelsActionDialogs } from "./components/content-models-action-dialogs";
import { ContentModelEditScreen } from "./components/content-model-edit-screen";
import type { ContentModelsTableRow } from "./types";
import { buildDuplicateContentModelPayload } from "./utils";

type ContentModelEditPageProps = {
  projectId: string;
  modelId?: string;
  section?: "fields" | "settings";
};

export function ContentModelEditPage({ projectId, modelId, section }: ContentModelEditPageProps) {
  const { t } = useTranslation(["content", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const canManageModels = permissionAccess.hasAction("project:content:models:write");
  const [duplicateModel, setDuplicateModel] = React.useState<ContentModelsTableRow | null>(null);
  const [deleteModelState, setDeleteModelState] = React.useState<ContentModelsTableRow | null>(
    null,
  );

  const modelsQuery = useQuery({
    queryKey: buildContentModelsQueryKey(projectId),
    queryFn: () => listAllContentModels(projectId),
  });

  const activeModel = React.useMemo(
    () => (modelId ? (modelsQuery.data ?? []).find((model) => model.id === modelId) : null),
    [modelId, modelsQuery.data],
  );

  const refreshModels = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: buildContentModelsQueryKey(projectId) });
  }, [projectId, queryClient]);

  const handleModelChange = React.useCallback(
    (nextModel: ContentModelsTableRow) => {
      queryClient.setQueryData<ContentModelsTableRow[]>(
        buildContentModelsQueryKey(projectId),
        (current) =>
          current?.map((model) => (model.id === nextModel.id ? nextModel : model)) ?? [nextModel],
      );
    },
    [projectId, queryClient],
  );

  const navigateToModels = React.useCallback(() => {
    void navigate({ to: projectContentModelsPath(projectId) });
  }, [navigate, projectId]);

  const navigateToModel = React.useCallback(
    (model: ContentModelsTableRow) => {
      void navigate({ to: projectContentModelsEditPath(projectId, model.id) });
    },
    [navigate, projectId],
  );

  const duplicateMutation = useMutation({
    mutationFn: async (model: ContentModelsTableRow) => {
      const existingModels = await listAllContentModels(projectId);
      return createContentModel(
        projectId,
        buildDuplicateContentModelPayload({ model, existingModels, t }),
      );
    },
    onSuccess: async (model) => {
      await refreshModels();
      setDuplicateModel(null);
      navigateToModel(model);
      notifySuccessText(t("content:CONTENT_MODELS_DUPLICATE_SUCCESS"));
    },
    onError: notifyError,
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetModel: ContentModelsTableRow) => {
      await deleteContentModel(projectId, targetModel.id);
      return targetModel;
    },
    onSuccess: async () => {
      await refreshModels();
      setDeleteModelState(null);
      navigateToModels();
      notifySuccessText(t("content:CONTENT_MODELS_DELETE_SUCCESS"));
    },
    onError: notifyError,
  });

  if (!activeModel) {
    return (
      <DefaultPage title={t("content:CONTENT_MODELS_TITLE")} showFavoriteToggle={false}>
        <ContentGuard
          loading={modelsQuery.isLoading}
          error={modelsQuery.error}
          empty
          emptyTitle={t("content:CONTENT_MODELS_EDIT_EMPTY_TITLE")}
          emptyDescription={t("content:CONTENT_MODELS_EDIT_EMPTY_DESC")}
          emptyExtra={
            <Button variant="outline" onClick={navigateToModels}>
              {t("content:CONTENT_MODELS_EDIT_BACK_ACTION")}
            </Button>
          }
        />
      </DefaultPage>
    );
  }

  return (
    <>
      <ContentModelEditScreen
        projectId={projectId}
        model={activeModel}
        section={section}
        canManageModels={canManageModels}
        pending={duplicateMutation.isPending || deleteMutation.isPending}
        onDuplicate={setDuplicateModel}
        onDelete={setDeleteModelState}
        onModelChange={handleModelChange}
        onRefreshModels={refreshModels}
        onClose={navigateToModels}
      />
      <ContentModelsActionDialogs
        duplicateDialog={{
          row: duplicateModel,
          pending: duplicateMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !duplicateMutation.isPending) setDuplicateModel(null);
          },
          onConfirm: async () => {
            if (!duplicateModel) return;
            await duplicateMutation.mutateAsync(duplicateModel);
          },
        }}
        deleteDialog={{
          row: deleteModelState,
          pending: deleteMutation.isPending,
          onOpenChange: (open) => {
            if (!open && !deleteMutation.isPending) setDeleteModelState(null);
          },
          onConfirm: async () => {
            if (!deleteModelState) return;
            await deleteMutation.mutateAsync(deleteModelState);
          },
        }}
        bulkDuplicateDialog={{
          count: 0,
          open: false,
          pending: false,
          onOpenChange: () => undefined,
          onConfirm: () => undefined,
        }}
        bulkDeleteDialog={{
          count: 0,
          open: false,
          pending: false,
          onOpenChange: () => undefined,
          onConfirm: () => undefined,
        }}
      />
    </>
  );
}
