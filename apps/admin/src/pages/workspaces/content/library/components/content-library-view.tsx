import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listWorkspaceContentModels, type ContentModelSummary } from "@/api/content-models";
import {
  createWorkspaceSiteEntry,
  listWorkspaceSiteEntries,
  publishWorkspaceSiteEntry,
  unpublishWorkspaceSiteEntry,
} from "@/api/workspace-site";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { useAdminDateTimeFormatter } from "@/hooks/use-admin-date-time-formatter";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import {
  CreateContentEntryDialog,
  type CreateContentEntryInput,
} from "./create-content-entry-dialog";

type LibraryRow = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  updatedAt: string | null;
  draftRevision: number;
  publishedRevision: number | null;
  entryTypeCode: string;
};

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

const EMPTY_ROWS: LibraryRow[] = [];

function useLibraryModelsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: ["content", "models", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceContentModels(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
}

function mapEntryToRow(entry: {
  id: string;
  title?: string | null;
  slug: string;
  status?: string;
  updatedAt?: string;
  draftRevision: number;
  publishedRevision?: number | null;
  entryTypeCode: string;
}): LibraryRow {
  return {
    id: entry.id,
    title: entry.title || entry.slug,
    slug: entry.slug,
    status: entry.publishedRevision ? "published" : "draft",
    updatedAt: entry.updatedAt ?? null,
    draftRevision: entry.draftRevision,
    publishedRevision: entry.publishedRevision ?? null,
    entryTypeCode: entry.entryTypeCode,
  };
}

function buildLibraryRows(
  items: readonly {
    id: string;
    title?: string | null;
    slug: string;
    status?: string;
    updatedAt?: string;
    draftRevision: number;
    publishedRevision?: number | null;
    entryTypeCode: string;
  }[],
): LibraryRow[] {
  return items.map(mapEntryToRow);
}

function formatRevisionValue(revision: number | null): string {
  if (!revision) return "-";
  return `v${revision}`;
}

function ContentLibraryMetrics(props: { rows: readonly LibraryRow[]; t: TranslationFn }) {
  const publishedCount = props.rows.filter((row) => row.publishedRevision).length;
  const draftOnlyCount = props.rows.length - publishedCount;
  const metrics = [
    { label: props.t("content_library:LIBRARY_METRIC_TOTAL"), value: props.rows.length },
    { label: props.t("content_library:LIBRARY_METRIC_DRAFT"), value: draftOnlyCount },
    { label: props.t("content_library:LIBRARY_METRIC_PUBLISHED"), value: publishedCount },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="text-footnote text-label-secondary">{metric.label}</div>
          <div className="mt-2 text-title1 text-foreground">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function ContentLibraryHeader(props: { model: ContentModelSummary; t: TranslationFn }) {
  return (
    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <div className="text-title2 text-foreground">{props.model.name}</div>
        <div className="text-body text-label-secondary">
          <span>{props.model.key}</span>
          <span className="mx-2 text-quaternary">·</span>
          <span>{props.model.defaultEditor}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {props.model.capabilities.map((capability) => (
          <Tag key={capability} variant="filled" className="m-0 rounded-md px-2 py-1">
            {capability}
          </Tag>
        ))}
      </div>
    </div>
  );
}

function buildLibraryColumns(opts: {
  formatUpdatedAt: (value: string | null) => string;
  processingIds: ReadonlySet<string>;
  onPublish: (row: LibraryRow) => void;
  onUnpublish: (row: LibraryRow) => void;
  t: TranslationFn;
}): ColumnsType<LibraryRow> {
  return [
    { title: opts.t("content_library:LIBRARY_TABLE_TITLE"), dataIndex: "title", key: "title" },
    { title: opts.t("content_library:LIBRARY_TABLE_SLUG"), dataIndex: "slug", key: "slug" },
    {
      title: opts.t("content_library:LIBRARY_TABLE_STATUS"),
      dataIndex: "status",
      key: "status",
      render: (_value, row) => (
        <Tag color={row.status === "published" ? "green" : "gold"}>
          {row.status === "published"
            ? opts.t("content_library:LIBRARY_STATUS_PUBLISHED")
            : opts.t("content_library:LIBRARY_STATUS_DRAFT")}
        </Tag>
      ),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_DRAFT_REVISION"),
      dataIndex: "draftRevision",
      key: "draftRevision",
      render: (_value, row) => formatRevisionValue(row.draftRevision),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_PUBLISHED_REVISION"),
      dataIndex: "publishedRevision",
      key: "publishedRevision",
      render: (_value, row) => formatRevisionValue(row.publishedRevision),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_UPDATED"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      render: (_value, row) => opts.formatUpdatedAt(row.updatedAt),
    },
    {
      title: opts.t("content_library:LIBRARY_TABLE_ACTIONS"),
      key: "actions",
      render: (_value, row) => {
        const processing = opts.processingIds.has(row.id);
        if (row.publishedRevision) {
          return (
            <Button
              size="small"
              autoInsertSpace={false}
              loading={processing}
              disabled={processing}
              onClick={() => opts.onUnpublish(row)}
            >
              {opts.t("content_library:LIBRARY_ACTION_UNPUBLISH")}
            </Button>
          );
        }

        return (
          <Button
            type="primary"
            size="small"
            autoInsertSpace={false}
            loading={processing}
            disabled={processing || row.draftRevision < 1}
            onClick={() => opts.onPublish(row)}
          >
            {opts.t("content_library:LIBRARY_ACTION_PUBLISH")}
          </Button>
        );
      },
    },
  ];
}

function ContentLibraryEntryTable(props: {
  rows: readonly LibraryRow[];
  loading: boolean;
  processingIds: ReadonlySet<string>;
  formatUpdatedAt: (value: string | null) => string;
  onPublish: (row: LibraryRow) => void;
  onUnpublish: (row: LibraryRow) => void;
  t: TranslationFn;
}) {
  const columns = useMemo(
    () =>
      buildLibraryColumns({
        formatUpdatedAt: props.formatUpdatedAt,
        processingIds: props.processingIds,
        onPublish: props.onPublish,
        onUnpublish: props.onUnpublish,
        t: props.t,
      }),
    [props.formatUpdatedAt, props.onPublish, props.onUnpublish, props.processingIds, props.t],
  );

  return (
    <Table<LibraryRow>
      rowKey="id"
      columns={columns}
      dataSource={props.rows.length ? [...props.rows] : EMPTY_ROWS}
      loading={props.loading}
      pagination={false}
      locale={{ emptyText: props.t("content_library:LIBRARY_TABLE_EMPTY") }}
    />
  );
}

function addProcessingId(
  current: ReadonlySet<string>,
  rowId: string,
  processing: boolean,
): Set<string> {
  const next = new Set(current);
  if (processing) next.add(rowId);
  else next.delete(rowId);
  return next;
}

export function ContentLibraryView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const dateTime = useAdminDateTimeFormatter({ workspaceId });
  const [selectedModelKey, setSelectedModelKey] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const modelsQuery = useLibraryModelsQuery(workspaceId);

  const libraryModels = useMemo(
    () => (modelsQuery.data?.items ?? []).filter((item) => item.category === "content_library"),
    [modelsQuery.data?.items],
  );

  useEffect(() => {
    if (!libraryModels.length) {
      setSelectedModelKey(null);
      return;
    }
    if (selectedModelKey && libraryModels.some((item) => item.key === selectedModelKey)) return;
    setSelectedModelKey(libraryModels[0]?.key ?? null);
  }, [libraryModels, selectedModelKey]);

  const entriesQuery = useQuery({
    queryKey: ["content", "library", "entries", workspaceId, selectedModelKey],
    enabled: Boolean(workspaceId && selectedModelKey),
    queryFn: async () =>
      listWorkspaceSiteEntries(String(workspaceId), {
        entryTypeCode: String(selectedModelKey),
      }),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const selectedModel = libraryModels.find((item) => item.key === selectedModelKey) ?? null;
  const empty = !modelsQuery.isLoading && !modelsQuery.error && libraryModels.length === 0;
  const rows = useMemo(
    () => buildLibraryRows(entriesQuery.data?.items ?? []),
    [entriesQuery.data?.items],
  );

  const setRowProcessing = (rowId: string, processing: boolean) => {
    setProcessingIds((current) => addProcessingId(current, rowId, processing));
  };

  const invalidateEntries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["content", "library", "entries", workspaceId, selectedModelKey],
    });
  };

  const createMutation = useMutation({
    mutationFn: async (input: CreateContentEntryInput) => {
      if (!workspaceId || !selectedModel) throw new Error("CONTENT_MODEL_NOT_SELECTED");
      await createWorkspaceSiteEntry(String(workspaceId), {
        entryTypeCode: selectedModel.key,
        title: input.title,
        slug: input.slug,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:LIBRARY_TOAST_CREATE_SUCCESS"));
      setDialogOpen(false);
      await invalidateEntries();
    },
    onError: (error) => notifyError(error),
  });

  const publishMutation = useMutation({
    mutationFn: async (row: LibraryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      setRowProcessing(row.id, true);
      try {
        return await publishWorkspaceSiteEntry(String(workspaceId), {
          entryTypeCode: row.entryTypeCode,
          slug: row.slug,
          revision: row.draftRevision,
        });
      } finally {
        setRowProcessing(row.id, false);
      }
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:LIBRARY_TOAST_PUBLISH_SUCCESS"));
      await invalidateEntries();
    },
    onError: (error) => notifyError(error),
  });

  const unpublishMutation = useMutation({
    mutationFn: async (row: LibraryRow) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      setRowProcessing(row.id, true);
      try {
        return await unpublishWorkspaceSiteEntry(String(workspaceId), {
          entryTypeCode: row.entryTypeCode,
          slug: row.slug,
        });
      } finally {
        setRowProcessing(row.id, false);
      }
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:LIBRARY_TOAST_UNPUBLISH_SUCCESS"));
      await invalidateEntries();
    },
    onError: (error) => notifyError(error),
  });

  return (
    <>
      <DefaultPage
        width="fixed"
        title={t("content_library:LIBRARY_PAGE_TITLE")}
        description={t("content_library:LIBRARY_PAGE_DESC")}
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            autoInsertSpace={false}
            disabled={!selectedModel}
            onClick={() => setDialogOpen(true)}
          >
            {t("content_library:LIBRARY_CREATE_ACTION")}
          </Button>
        }
        extra={
          selectedModel ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-footnote text-label-secondary">
                {t("content_library:LIBRARY_SWITCHER_LABEL")}
              </label>
              <Select
                value={selectedModel.key}
                onChange={setSelectedModelKey}
                options={libraryModels.map((item) => ({
                  value: item.key,
                  label: item.name,
                }))}
                className="min-w-[220px]"
              />
            </div>
          ) : null
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
              <Card className="border-border shadow-none">
                <ContentLibraryHeader model={selectedModel} t={t} />
                <ContentGuard
                  loading={entriesQuery.isLoading}
                  error={entriesQuery.error}
                  empty={false}
                  onRetry={() => void entriesQuery.refetch()}
                  container="raw"
                >
                  <ContentLibraryEntryTable
                    rows={rows}
                    loading={entriesQuery.isLoading}
                    processingIds={processingIds}
                    formatUpdatedAt={(value) => (value ? dateTime.formatDateTime(value) : "-")}
                    onPublish={(row) => void publishMutation.mutateAsync(row)}
                    onUnpublish={(row) => void unpublishMutation.mutateAsync(row)}
                    t={t}
                  />
                </ContentGuard>
              </Card>
            ) : null}
          </div>
        </ContentGuard>
      </DefaultPage>

      <CreateContentEntryDialog
        open={dialogOpen}
        modelName={selectedModel?.name ?? "-"}
        confirmLoading={createMutation.isPending}
        onOpenChange={setDialogOpen}
        onConfirm={async (input) => {
          await createMutation.mutateAsync(input);
        }}
      />
    </>
  );
}
