import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  archiveWorkspaceContentItemVersion,
  createWorkspaceContentItem,
  listWorkspaceContentItems,
  publishWorkspaceContentItemVersion,
} from "@/api/content-items";
import {
  createWorkspaceContentView,
  listWorkspaceContentViews,
  previewWorkspaceContentView,
} from "@/api/content-views";
import { getWorkspacePublishImpact } from "@/api/content-publish";
import { ContentGuard } from "@/components/common/content-guard";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { WorkspaceContentShell } from "@/pages/workspaces/content/shared/content-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import {
  CreateContentEntryDialog,
  type CreateContentEntryInput,
} from "./create-content-entry-dialog";
import {
  ContentLibraryCard,
  ContentLibraryEntryTable,
  ContentLibraryMetrics,
  ContentLibraryPublishImpactCard,
  buildLibraryRows,
  type LibraryRow,
} from "./content-library-table";
import {
  ContentLibraryToolbar,
  DEFAULT_LIBRARY_VIEW_ID,
  addProcessingId,
  buildPreviewRows,
  buildViewDsl,
  filterLibraryModels,
  filterLibraryViews,
  useLibraryModelsQuery,
} from "./content-library-views";
import { CreateContentViewDialog, type CreateContentViewInput } from "./create-content-view-dialog";

export function ContentLibraryView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const dateTime = useAdminDateTimeFormatter({ workspaceId });
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [selectedViewId, setSelectedViewId] = useState<string>(DEFAULT_LIBRARY_VIEW_ID);
  const [pendingViewId, setPendingViewId] = useState<string | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const modelsQuery = useLibraryModelsQuery(workspaceId);

  const libraryModels = useMemo(
    () => filterLibraryModels(modelsQuery.data?.items ?? []),
    [modelsQuery.data?.items],
  );
  const selectedModel = libraryModels.find((item) => item.key === selectedModelKey) ?? null;
  const empty = !modelsQuery.isLoading && !modelsQuery.error && libraryModels.length === 0;

  useEffect(() => {
    if (!libraryModels.length) {
      setSelectedModelKey(null);
      return;
    }
    if (selectedModelKey && libraryModels.some((item) => item.key === selectedModelKey)) return;
    setSelectedModelKey(libraryModels[0]?.key ?? null);
  }, [libraryModels, selectedModelKey]);

  useEffect(() => {
    setSelectedViewId(DEFAULT_LIBRARY_VIEW_ID);
    setPendingViewId(null);
  }, [selectedModelKey]);

  const entriesQuery = useQuery({
    queryKey: ["content", "library", "entries", workspaceId, selectedModelKey],
    enabled: Boolean(workspaceId && selectedModelKey),
    queryFn: async () =>
      listWorkspaceContentItems(String(workspaceId), { modelKey: String(selectedModelKey) }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const viewsQuery = useQuery({
    queryKey: ["content", "library", "views", workspaceId, selectedModelKey],
    enabled: Boolean(workspaceId && selectedModelKey),
    queryFn: async () => listWorkspaceContentViews(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const publishImpactQuery = useQuery({
    queryKey: ["content", "library", "publish-impact", workspaceId, selectedModelKey],
    enabled: Boolean(workspaceId && selectedModelKey),
    queryFn: async () => getWorkspacePublishImpact(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const libraryViews = useMemo(
    () => filterLibraryViews(viewsQuery.data?.items ?? [], selectedModelKey),
    [selectedModelKey, viewsQuery.data?.items],
  );
  const activeSavedView = libraryViews.find((item) => item.id === selectedViewId) ?? null;
  useEffect(() => {
    if (!pendingViewId) return;
    if (!libraryViews.some((item) => item.id === pendingViewId)) return;
    setSelectedViewId(pendingViewId);
    setPendingViewId(null);
  }, [libraryViews, pendingViewId]);
  useEffect(() => {
    if (pendingViewId) return;
    if (selectedViewId !== DEFAULT_LIBRARY_VIEW_ID && !activeSavedView) {
      setSelectedViewId(DEFAULT_LIBRARY_VIEW_ID);
    }
  }, [activeSavedView, pendingViewId, selectedViewId]);

  const viewPreviewQuery = useQuery({
    queryKey: ["content", "library", "view-preview", workspaceId, selectedViewId],
    enabled: Boolean(workspaceId && selectedViewId !== DEFAULT_LIBRARY_VIEW_ID),
    queryFn: async () =>
      previewWorkspaceContentView(String(workspaceId), selectedViewId, { limit: 100, offset: 0 }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const rows =
    selectedViewId === DEFAULT_LIBRARY_VIEW_ID
      ? buildLibraryRows(entriesQuery.data?.items ?? [])
      : buildPreviewRows(viewPreviewQuery.data?.items ?? []);
  const activeDataLoading =
    selectedViewId === DEFAULT_LIBRARY_VIEW_ID
      ? entriesQuery.isLoading
      : viewPreviewQuery.isLoading;
  const activeDataError =
    selectedViewId === DEFAULT_LIBRARY_VIEW_ID ? entriesQuery.error : viewPreviewQuery.error;
  const viewOptions = useMemo(
    () => [
      { value: DEFAULT_LIBRARY_VIEW_ID, label: t("content_library:LIBRARY_VIEW_DEFAULT_OPTION") },
      ...libraryViews.map((item) => ({ value: item.id, label: item.name })),
    ],
    [libraryViews, t],
  );

  const invalidateLibraryQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["content", "library", "entries", workspaceId, selectedModelKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["content", "library", "views", workspaceId, selectedModelKey],
    });
    await queryClient.invalidateQueries({
      queryKey: ["content", "library", "view-preview", workspaceId],
    });
  };

  const createEntryMutation = useMutation({
    mutationFn: async (input: CreateContentEntryInput) => {
      if (!workspaceId || !selectedModel) throw new Error("CONTENT_MODEL_NOT_SELECTED");
      await createWorkspaceContentItem(String(workspaceId), {
        modelKey: selectedModel.key,
        title: input.title,
        slug: input.slug,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:LIBRARY_TOAST_CREATE_SUCCESS"));
      setEntryDialogOpen(false);
      await invalidateLibraryQueries();
    },
    onError: (error) => notifyError(error),
  });

  const createViewMutation = useMutation({
    mutationFn: async (input: CreateContentViewInput) => {
      if (!workspaceId || !selectedModel) throw new Error("CONTENT_MODEL_NOT_SELECTED");
      return createWorkspaceContentView(String(workspaceId), {
        code: input.code,
        name: input.name,
        typeCode: selectedModel.key,
        enabled: true,
        dsl: buildViewDsl(input.statusFilter),
      });
    },
    onSuccess: async (view) => {
      notifySuccessText(t("content_library:LIBRARY_VIEW_TOAST_CREATE_SUCCESS"));
      setViewDialogOpen(false);
      setPendingViewId(view.id);
      await invalidateLibraryQueries();
    },
    onError: (error) => notifyError(error),
  });

  const publishMutation = useMutation({
    mutationFn: async (row: LibraryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      setProcessingIds((current) => addProcessingId(current, row.id, true));
      try {
        return await publishWorkspaceContentItemVersion(
          String(workspaceId),
          row.id,
          row.draftVersion,
        );
      } finally {
        setProcessingIds((current) => addProcessingId(current, row.id, false));
      }
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:LIBRARY_TOAST_PUBLISH_SUCCESS"));
      await invalidateLibraryQueries();
    },
    onError: (error) => notifyError(error),
  });

  const unpublishMutation = useMutation({
    mutationFn: async (row: LibraryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      setProcessingIds((current) => addProcessingId(current, row.id, true));
      try {
        return await archiveWorkspaceContentItemVersion(
          String(workspaceId),
          row.id,
          row.publishedVersion ?? row.draftVersion,
        );
      } finally {
        setProcessingIds((current) => addProcessingId(current, row.id, false));
      }
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:LIBRARY_TOAST_UNPUBLISH_SUCCESS"));
      await invalidateLibraryQueries();
    },
    onError: (error) => notifyError(error),
  });

  return (
    <>
      <WorkspaceContentShell
        width="fixed"
        title={t("content_library:LIBRARY_PAGE_TITLE")}
        description={t("content_library:LIBRARY_PAGE_DESC")}
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            autoInsertSpace={false}
            disabled={!selectedModel}
            onClick={() => setEntryDialogOpen(true)}
          >
            {t("content_library:LIBRARY_CREATE_ACTION")}
          </Button>
        }
        extra={
          <ContentLibraryToolbar
            libraryModels={libraryModels}
            selectedModel={selectedModel}
            selectedViewId={selectedViewId}
            viewOptions={viewOptions}
            onCreateView={() => setViewDialogOpen(true)}
            onModelChange={setSelectedModelKey}
            onViewChange={setSelectedViewId}
            t={t}
          />
        }
      >
        <ContentGuard
          loading={modelsQuery.isLoading}
          error={modelsQuery.error}
          empty={empty}
          onRetry={() => void modelsQuery.refetch()}
          container="raw"
          emptyTitle={t("content_library:LIBRARY_EMPTY_TITLE")}
          emptyDescription={t("content_library:LIBRARY_EMPTY_DESC")}
        >
          <div className="grid gap-4">
            <ContentLibraryMetrics rows={rows} t={t} />
            {selectedModel ? (
              <>
                <ContentGuard
                  loading={publishImpactQuery.isLoading}
                  error={publishImpactQuery.error}
                  empty={false}
                  onRetry={() => void publishImpactQuery.refetch()}
                  container="raw"
                >
                  {publishImpactQuery.data ? (
                    <ContentLibraryPublishImpactCard impact={publishImpactQuery.data} t={t} />
                  ) : null}
                </ContentGuard>
                <ContentLibraryCard model={selectedModel} t={t}>
                  <ContentGuard
                    loading={activeDataLoading || viewsQuery.isLoading}
                    error={activeDataError || viewsQuery.error}
                    empty={false}
                    onRetry={() =>
                      selectedViewId === DEFAULT_LIBRARY_VIEW_ID
                        ? void entriesQuery.refetch()
                        : void viewPreviewQuery.refetch()
                    }
                    container="raw"
                  >
                    <ContentLibraryEntryTable
                      rows={rows}
                      loading={activeDataLoading}
                      processingIds={processingIds}
                      formatUpdatedAt={(value) => (value ? dateTime.formatDateTime(value) : "-")}
                      onPublish={(row) => void publishMutation.mutateAsync(row)}
                      onUnpublish={(row) => void unpublishMutation.mutateAsync(row)}
                      t={t}
                    />
                  </ContentGuard>
                </ContentLibraryCard>
              </>
            ) : null}
          </div>
        </ContentGuard>
      </WorkspaceContentShell>

      <CreateContentEntryDialog
        open={entryDialogOpen}
        modelName={selectedModel?.name ?? "-"}
        confirmLoading={createEntryMutation.isPending}
        onOpenChange={setEntryDialogOpen}
        onConfirm={async (input) => createEntryMutation.mutateAsync(input)}
      />
      <CreateContentViewDialog
        open={viewDialogOpen}
        modelName={selectedModel?.name ?? "-"}
        confirmLoading={createViewMutation.isPending}
        onOpenChange={setViewDialogOpen}
        onConfirm={async (input) => {
          await createViewMutation.mutateAsync(input);
        }}
      />
    </>
  );
}
