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
import { useRouteTransitionState } from "@/components/layout/route-transition";
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
import { CreateContentTypeDialog } from "./components/create-content-type-dialog";
import type { ContentModelsTableRow, CreateContentTypeSubmitValues } from "./types";
import { buildDuplicateContentModelPayload } from "./utils";

type ContentModelEditPageProps = {
  projectId: string;
  modelId?: string;
  createOpen?: boolean;
  section?: "fields" | "name_description" | "json_preview" | "settings" | "workflow";
};

const CREATE_FLOW_FALLBACK_MODEL: ContentModelsTableRow = {
  id: "__create__",
  workspaceId: "__create__",
  siteId: "__create__",
  singularKey: "newModel",
  pluralKey: "newModels",
  name: "",
  description: "",
  category: "custom",
  modelKind: "collection_type",
  capabilities: ["queryable"],
  defaultEditor: "form",
  draftContractRevision: 0,
  updatedAt: "",
  updatedByUserId: null,
  updatedBy: null,
};

export function ContentModelEditPage({
  projectId,
  modelId,
  createOpen = false,
  section,
}: ContentModelEditPageProps) {
  const { t } = useTranslation(["content", "common"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routeTransition = useRouteTransitionState();
  const permissionAccess = useProjectPermissionAccess(projectId);
  const canManageModels = permissionAccess.hasAction("project:content:models:write");
  const [duplicateModel, setDuplicateModel] = React.useState<ContentModelsTableRow | null>(null);
  const [deleteModelState, setDeleteModelState] = React.useState<ContentModelsTableRow | null>(
    null,
  );
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const shouldLoadModels = !createOpen || Boolean(modelId);

  const modelsQuery = useQuery({
    queryKey: buildContentModelsQueryKey(projectId),
    queryFn: () => listAllContentModels(projectId),
    enabled: shouldLoadModels,
  });

  const activeModel = React.useMemo(
    () => (modelId ? (modelsQuery.data ?? []).find((model) => model.id === modelId) : null),
    [modelId, modelsQuery.data],
  );
  const draftCreateModel = React.useMemo<ContentModelsTableRow | null>(
    () =>
      createOpen
        ? { ...CREATE_FLOW_FALLBACK_MODEL, name: t("content:CONTENT_MODELS_CREATE_UNTITLED_NAME") }
        : null,
    [createOpen, t],
  );

  React.useEffect(() => {
    if (!createOpen || !routeTransition.settled) {
      setCreateDialogOpen(false);
      return;
    }

    setCreateDialogOpen(true);
  }, [createOpen, routeTransition.settled]);

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

  const createMutation = useMutation({
    mutationFn: (values: CreateContentTypeSubmitValues) =>
      createContentModel(projectId, values.payload),
    onSuccess: async (model) => {
      await refreshModels();
      navigateToModel(model);
    },
    onError: notifyError,
  });

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

  if (!activeModel && !draftCreateModel) {
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

  const screenModel = activeModel ?? draftCreateModel;
  if (!screenModel) return null;

  return (
    <>
      <ContentModelEditScreen
        projectId={projectId}
        model={screenModel}
        section={section}
        canManageModels={canManageModels}
        pending={
          createMutation.isPending || duplicateMutation.isPending || deleteMutation.isPending
        }
        onDuplicate={setDuplicateModel}
        onDelete={setDeleteModelState}
        onModelChange={handleModelChange}
        onRefreshModels={refreshModels}
        onClose={navigateToModels}
      />
      <CreateContentTypeDialog
        open={createDialogOpen}
        pending={createMutation.isPending}
        onOpenChange={(open) => {
          if (open) {
            setCreateDialogOpen(true);
            return;
          }
          if (!createMutation.isPending) {
            setCreateDialogOpen(false);
            navigateToModels();
          }
        }}
        onSubmit={async (values) => {
          await createMutation.mutateAsync(values);
        }}
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
