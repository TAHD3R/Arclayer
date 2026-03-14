import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Tag } from "antd";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceContentModel,
  listWorkspaceContentModels,
  type CreateContentModelInput,
  type ContentModelSummary,
} from "@/api/content-models";
import { ContentGuard } from "@/components/common/content-guard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { WorkspaceContentShell } from "@/pages/workspaces/content/shared/content-shell";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import { CONTENT_MODEL_CAPABILITY_LABEL_KEYS } from "./content-model-labels";
import { CreateContentModelDialog } from "./create-content-model-dialog";

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

function countSchemaFields(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  const fields = (value as { fields?: unknown }).fields;
  return Array.isArray(fields) ? fields.length : 0;
}

function countSchemaRelations(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

function prettyJson(value: unknown): string {
  if (!value) return "Not configured yet.";
  return JSON.stringify(value, null, 2);
}

function ModelCatalog(props: {
  items: ContentModelSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  translate: (key: string) => string;
}) {
  if (props.items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-4">
        <div className="text-body font-medium text-foreground">
          {props.translate("content_library:MODELS_EMPTY_TITLE")}
        </div>
        <div className="mt-1 text-footnote text-label-secondary">
          {props.translate("content_library:MODELS_EMPTY_DESC")}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {props.items.map((item) => {
        const selected = item.id === props.selectedId;
        return (
          <button
            key={item.id}
            type="button"
            className={
              selected
                ? "rounded-2xl border border-primary bg-primary/5 p-4 text-left"
                : "rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/20"
            }
            onClick={() => props.onSelect(item.id)}
          >
            <div className="text-body font-medium text-foreground">{item.name}</div>
            <div className="mt-1 text-footnote text-label-secondary">{item.key}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {item.capabilities.slice(0, 3).map((capability) => (
                <Tag key={capability} variant="filled" className="m-0 rounded-md px-2 py-1">
                  {props.translate(CONTENT_MODEL_CAPABILITY_LABEL_KEYS[capability])}
                </Tag>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SchemaWorkspacePanel(props: {
  item: ContentModelSummary | null;
  translate: (key: string) => string;
}) {
  if (!props.item) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-muted/10 p-4">
        <div className="text-body font-medium text-foreground">
          {props.translate("content_library:MODELS_EMPTY_WORKSPACE_TITLE")}
        </div>
        <div className="mt-1 text-footnote text-label-secondary">
          {props.translate("content_library:MODELS_EMPTY_WORKSPACE_DESC")}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-title3 text-foreground">{props.item.name}</div>
        <div className="mt-1 text-footnote text-label-secondary">
          {props.item.description || props.item.key}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="text-body font-semibold text-foreground">
            {props.translate("content_library:MODELS_SECTION_FIELDS")}
          </div>
          <pre className="mt-3 overflow-auto rounded-xl bg-muted/20 p-3 text-xs text-label-secondary">
            {prettyJson(props.item.fieldSchema)}
          </pre>
        </section>
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="text-body font-semibold text-foreground">
            {props.translate("content_library:MODELS_SECTION_RELATIONS")}
          </div>
          <pre className="mt-3 overflow-auto rounded-xl bg-muted/20 p-3 text-xs text-label-secondary">
            {prettyJson(props.item.relationSchema)}
          </pre>
        </section>
      </div>
    </div>
  );
}

export function ContentModelsView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const modelsQuery = useModelsQuery(workspaceId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"blank" | "import">("blank");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const items = modelsQuery.data?.items ?? [];
  const selectedModel = items.find((item) => item.id === selectedModelId) ?? items[0] ?? null;

  useEffect(() => {
    if (!selectedModelId && items[0]) {
      setSelectedModelId(items[0].id);
    }
  }, [items, selectedModelId]);

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

  const pageExtra = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="default"
        autoInsertSpace={false}
        onClick={() => {
          setDialogMode("import");
          setDialogOpen(true);
        }}
      >
        {t("content_library:MODELS_IMPORT_ACTION")}
      </Button>
      <Button type="default" autoInsertSpace={false} disabled>
        {t("content_library:MODELS_COMPARE_ACTION")}
      </Button>
      <Button type="default" autoInsertSpace={false} disabled>
        {t("content_library:MODELS_HEALTH_ACTION")}
      </Button>
    </div>
  );

  return (
    <>
      <WorkspaceContentShell
        width="fixed"
        title={t("content_library:MODELS_PAGE_TITLE")}
        description={t("content_library:MODELS_PAGE_DESC")}
        extra={pageExtra}
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            autoInsertSpace={false}
            onClick={() => {
              setDialogMode("blank");
              setDialogOpen(true);
            }}
          >
            {t("content_library:MODELS_CREATE_ACTION")}
          </Button>
        }
      >
        <ContentGuard
          loading={modelsQuery.isLoading}
          error={modelsQuery.error}
          empty={false}
          onRetry={() => void modelsQuery.refetch()}
          container="raw"
        >
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
            <section className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="text-title3 text-foreground">
                {t("content_library:MODELS_PANEL_LIST_TITLE")}
              </div>
              <div className="mt-1 text-footnote text-label-secondary">
                {t("content_library:MODELS_PANEL_LIST_DESC")}
              </div>
              <div className="mt-4">
                <ModelCatalog
                  items={items}
                  selectedId={selectedModel?.id ?? null}
                  onSelect={setSelectedModelId}
                  translate={t}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="text-title3 text-foreground">
                {t("content_library:MODELS_PANEL_WORKSPACE_TITLE")}
              </div>
              <div className="mt-1 text-footnote text-label-secondary">
                {t("content_library:MODELS_PANEL_WORKSPACE_DESC")}
              </div>
              <div className="mt-4">
                <SchemaWorkspacePanel item={selectedModel} translate={t} />
              </div>
            </section>

            <aside className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="text-title3 text-foreground">
                {t("content_library:MODELS_PANEL_INSPECTOR_TITLE")}
              </div>
              <div className="mt-1 text-footnote text-label-secondary">
                {t("content_library:MODELS_PANEL_INSPECTOR_DESC")}
              </div>
              <div className="mt-4 rounded-2xl border border-border bg-card p-4">
                <div className="text-footnote uppercase tracking-[0.18em] text-label-secondary">
                  {t("content_library:MODELS_IMPACT_STATUS_TITLE")}
                </div>
                <div className="mt-2 text-body font-medium text-foreground">
                  {selectedModel
                    ? t("content_library:MODELS_IMPACT_STATUS_WARN")
                    : t("content_library:MODELS_EMPTY_INSPECTOR_TITLE")}
                </div>
                <div className="mt-1 text-footnote text-label-secondary">
                  {selectedModel
                    ? t("content_library:MODELS_IMPACT_DESC")
                    : t("content_library:MODELS_EMPTY_INSPECTOR_DESC")}
                </div>
              </div>
              <div className="mt-4 grid gap-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-footnote text-label-secondary">
                    {t("content_library:MODELS_IMPACT_FIELDS")}
                  </span>
                  <span className="text-body font-medium text-foreground">
                    {countSchemaFields(selectedModel?.fieldSchema)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-footnote text-label-secondary">
                    {t("content_library:MODELS_IMPACT_RELATIONS")}
                  </span>
                  <span className="text-body font-medium text-foreground">
                    {countSchemaRelations(selectedModel?.relationSchema)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-footnote text-label-secondary">
                    {t("content_library:MODELS_IMPACT_CAPABILITIES")}
                  </span>
                  <span className="text-body font-medium text-foreground">
                    {selectedModel?.capabilities.length ?? 0}
                  </span>
                </div>
              </div>
            </aside>
          </div>
        </ContentGuard>
      </WorkspaceContentShell>

      <CreateContentModelDialog
        open={dialogOpen}
        confirmLoading={createMutation.isPending}
        openImportOnOpen={dialogMode === "import"}
        onOpenChange={setDialogOpen}
        onConfirm={async (input) => {
          await createMutation.mutateAsync(input);
        }}
      />
    </>
  );
}
