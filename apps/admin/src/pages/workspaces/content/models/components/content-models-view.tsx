import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Tag } from "antd";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceContentModel,
  listWorkspaceContentModels,
  type CreateContentModelInput,
} from "@/api/content-models";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import { CreateContentModelDialog } from "./create-content-model-dialog";
import {
  CONTENT_MODEL_CAPABILITY_LABEL_KEYS,
  CONTENT_MODEL_CATEGORY_LABEL_KEYS,
  CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS,
} from "./content-model-labels";

function useModelsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ["content", "models", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceContentModels(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
}

export function ContentModelsView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const modelsQuery = useModelsQuery(workspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);

  const items = useMemo(() => modelsQuery.data?.items ?? [], [modelsQuery.data?.items]);
  const empty = !modelsQuery.isLoading && !modelsQuery.error && items.length === 0;

  const createMutation = useMutation({
    mutationFn: async (input: CreateContentModelInput) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await createWorkspaceContentModel(String(workspaceId), input);
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:MODELS_TOAST_CREATE_SUCCESS"));
      setDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["content", "models", workspaceId] });
    },
    onError: (error) => notifyError(error),
  });

  return (
    <>
      <DefaultPage
        width="fixed"
        title={t("content_library:MODELS_PAGE_TITLE")}
        description={t("content_library:MODELS_PAGE_DESC")}
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            autoInsertSpace={false}
            onClick={() => setDialogOpen(true)}
          >
            {t("content_library:MODELS_CREATE_ACTION")}
          </Button>
        }
      >
        <ContentGuard
          loading={modelsQuery.isLoading}
          error={modelsQuery.error}
          empty={empty}
          onRetry={() => void modelsQuery.refetch()}
          container="raw"
          emptyTitle={t("content_library:MODELS_EMPTY_TITLE")}
          emptyDescription={t("content_library:MODELS_EMPTY_DESC")}
        >
          <div className="grid gap-4">
            {items.map((item) => (
              <Card key={item.id} className="border-border shadow-none">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1.5">
                    <div className="text-title2 text-foreground">{item.name}</div>
                    <div className="text-body text-label-secondary">
                      <span>{item.key}</span>
                      <span className="mx-2 text-quaternary">·</span>
                      <span>{t(CONTENT_MODEL_CATEGORY_LABEL_KEYS[item.category])}</span>
                      <span className="mx-2 text-quaternary">·</span>
                      <span>{t(CONTENT_MODEL_DEFAULT_EDITOR_LABEL_KEYS[item.defaultEditor])}</span>
                    </div>
                    {item.description ? (
                      <div className="text-callout text-label-secondary">{item.description}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.capabilities.map((capability: string) => (
                      <Tag key={capability} variant="filled" className="m-0 rounded-md px-2 py-1">
                        {t(
                          CONTENT_MODEL_CAPABILITY_LABEL_KEYS[
                            capability as keyof typeof CONTENT_MODEL_CAPABILITY_LABEL_KEYS
                          ],
                        )}
                      </Tag>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ContentGuard>
      </DefaultPage>

      <CreateContentModelDialog
        open={dialogOpen}
        confirmLoading={createMutation.isPending}
        onOpenChange={setDialogOpen}
        onConfirm={async (input) => {
          await createMutation.mutateAsync(input);
        }}
      />
    </>
  );
}
