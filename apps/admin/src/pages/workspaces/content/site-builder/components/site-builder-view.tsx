import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Tag } from "antd";
import { ExternalLink, LayoutPanelTop, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createWorkspaceSitePage,
  listWorkspaceSiteGlobalSections,
  listWorkspaceSitePagesTree,
  publishWorkspaceSitePage,
  unpublishWorkspaceSitePage,
} from "@/api/workspace-site";
import { ContentGuard } from "@/components/common/content-guard";
import { DefaultPage } from "@/components/common/default-page";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { openStudioPageEditor } from "@/lib/routing/studio-editor";
import { useWorkspaceStore } from "@/stores/use-workspace-store";

import { CreateSitePageDialog, type CreateSitePageInput } from "./create-site-page-dialog";

type SiteBuilderPageNode = {
  id: string;
  path: string;
  title?: string | null;
  draftRevision?: number;
  publishedRevision?: number | null;
  children?: SiteBuilderPageNode[];
};

type GlobalSection = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
};

type TranslationFn = (key: string, options?: Record<string, unknown>) => string;

function flattenPages(nodes: readonly SiteBuilderPageNode[]): SiteBuilderPageNode[] {
  return nodes.flatMap((node) => [node, ...flattenPages(node.children ?? [])]);
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

function RevisionTag(props: { label: string; revision?: number | null }) {
  return (
    <Tag variant="filled" className="m-0 rounded-md bg-muted px-2 py-0.5 text-footnote">
      {props.revision ? `${props.label} v${props.revision}` : `${props.label} -`}
    </Tag>
  );
}

function PageStatusTag(props: { publishedRevision?: number | null; t: TranslationFn }) {
  const label = props.publishedRevision
    ? props.t("content_library:SITE_BUILDER_STATUS_PUBLISHED")
    : props.t("content_library:SITE_BUILDER_STATUS_DRAFT");

  return <Tag color={props.publishedRevision ? "green" : "gold"}>{label}</Tag>;
}

function SiteBuilderMetrics(props: {
  draftCount: number;
  globalCount: number;
  pageCount: number;
  publishedCount: number;
  t: TranslationFn;
}) {
  const metrics = [
    { label: props.t("content_library:SITE_BUILDER_PAGES_TITLE"), value: props.pageCount },
    {
      label: props.t("content_library:SITE_BUILDER_METRIC_PUBLISHED"),
      value: props.publishedCount,
    },
    { label: props.t("content_library:SITE_BUILDER_METRIC_DRAFT"), value: props.draftCount },
    { label: props.t("content_library:SITE_BUILDER_GLOBALS_TITLE"), value: props.globalCount },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="text-footnote text-label-secondary">{metric.label}</div>
          <div className="mt-2 text-title1 text-foreground">{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

function GlobalSectionsCard(props: {
  error: unknown;
  isLoading: boolean;
  items: readonly GlobalSection[];
  onRetry: () => void;
  t: TranslationFn;
}) {
  return (
    <Card className="border-border shadow-none">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-title2 text-foreground">
            {props.t("content_library:SITE_BUILDER_GLOBALS_TITLE")}
          </div>
          <div className="text-body text-label-secondary">
            {props.t("content_library:SITE_BUILDER_GLOBALS_DESC")}
          </div>
        </div>
        <LayoutPanelTop className="size-5 text-label-secondary" />
      </div>
      <ContentGuard
        loading={props.isLoading}
        error={props.error}
        empty={false}
        onRetry={props.onRetry}
        container="raw"
      >
        <div className="grid gap-3">
          {props.items.length ? (
            props.items.map((section) => (
              <div
                key={section.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-body font-medium text-foreground">
                    {section.name}
                  </div>
                  <div className="truncate text-footnote text-label-secondary">{section.kind}</div>
                </div>
                <Tag color={section.enabled ? "green" : "default"}>
                  {section.enabled
                    ? props.t("content_library:SITE_BUILDER_GLOBAL_ENABLED")
                    : props.t("content_library:SITE_BUILDER_GLOBAL_DISABLED")}
                </Tag>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-body text-label-secondary">
              {props.t("content_library:SITE_BUILDER_GLOBALS_EMPTY")}
            </div>
          )}
        </div>
      </ContentGuard>
    </Card>
  );
}

function PageListCard(props: {
  onOpenEditor: (page: SiteBuilderPageNode) => void;
  onPublish: (page: SiteBuilderPageNode) => void;
  onUnpublish: (page: SiteBuilderPageNode) => void;
  pages: readonly SiteBuilderPageNode[];
  processingIds: ReadonlySet<string>;
  t: TranslationFn;
}) {
  const primaryPage = props.pages[0] ?? null;

  return (
    <Card className="border-border shadow-none">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-title2 text-foreground">
            {props.t("content_library:SITE_BUILDER_LIST_TITLE")}
          </div>
          <div className="text-body text-label-secondary">
            {primaryPage ? primaryPage.path : props.t("content_library:SITE_BUILDER_EMPTY_DESC")}
          </div>
        </div>
        {primaryPage ? (
          <Button
            type="text"
            icon={<ExternalLink size={16} />}
            autoInsertSpace={false}
            onClick={() => props.onOpenEditor(primaryPage)}
          >
            {props.t("content_library:SITE_BUILDER_OPEN_EDITOR")}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-3">
        {props.pages.map((page) => {
          const processing = props.processingIds.has(page.id);
          return (
            <div
              key={page.id}
              className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0">
                <div className="truncate text-body font-medium text-foreground">
                  {page.title || page.path}
                </div>
                <div className="mt-1 truncate text-footnote text-label-secondary">{page.path}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PageStatusTag publishedRevision={page.publishedRevision} t={props.t} />
                  <RevisionTag
                    label={props.t("content_library:SITE_BUILDER_REVISION_DRAFT")}
                    revision={page.draftRevision ?? null}
                  />
                  <RevisionTag
                    label={props.t("content_library:SITE_BUILDER_REVISION_PUBLISHED")}
                    revision={page.publishedRevision ?? null}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="default"
                  autoInsertSpace={false}
                  onClick={() => props.onOpenEditor(page)}
                >
                  {props.t("content_library:SITE_BUILDER_OPEN_EDITOR")}
                </Button>
                {page.publishedRevision ? (
                  <Button
                    autoInsertSpace={false}
                    loading={processing}
                    disabled={processing}
                    onClick={() => props.onUnpublish(page)}
                  >
                    {props.t("content_library:SITE_BUILDER_ACTION_UNPUBLISH")}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    autoInsertSpace={false}
                    loading={processing}
                    disabled={processing || !page.draftRevision}
                    onClick={() => props.onPublish(page)}
                  >
                    {props.t("content_library:SITE_BUILDER_ACTION_PUBLISH")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function SiteBuilderView() {
  const { t } = useTranslation(["content_library", "nav", "common"]);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const pagesQuery = useQuery({
    queryKey: ["content", "site-builder", "pages", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSitePagesTree(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const globalSectionsQuery = useQuery({
    queryKey: ["content", "site-builder", "globals", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => listWorkspaceSiteGlobalSections(String(workspaceId)),
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const pages = useMemo(
    () => flattenPages((pagesQuery.data?.items ?? []) as SiteBuilderPageNode[]),
    [pagesQuery.data?.items],
  );
  const globalSections = useMemo(
    () => (globalSectionsQuery.data?.items ?? []) as GlobalSection[],
    [globalSectionsQuery.data?.items],
  );
  const empty = !pagesQuery.isLoading && !pagesQuery.error && pages.length === 0;
  const publishedCount = pages.filter((page) => page.publishedRevision).length;
  const draftCount = pages.length - publishedCount;

  const setRowProcessing = (rowId: string, processing: boolean) => {
    setProcessingIds((current) => addProcessingId(current, rowId, processing));
  };

  const refreshBuilderQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["content", "site-builder", "pages", workspaceId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["content", "site-builder", "globals", workspaceId],
    });
  };

  const createMutation = useMutation({
    mutationFn: async (input: CreateSitePageInput) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      await createWorkspaceSitePage(String(workspaceId), {
        title: input.title,
        path: input.path,
      });
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:SITE_BUILDER_TOAST_CREATE_SUCCESS"));
      setDialogOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["content", "site-builder", "pages", workspaceId],
      });
    },
    onError: (error) => notifyError(error),
  });

  const publishMutation = useMutation({
    mutationFn: async (page: SiteBuilderPageNode) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      setRowProcessing(page.id, true);
      try {
        return await publishWorkspaceSitePage(String(workspaceId), page.id, {
          revision: page.draftRevision ?? undefined,
        });
      } finally {
        setRowProcessing(page.id, false);
      }
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:SITE_BUILDER_TOAST_PUBLISH_SUCCESS"));
      await refreshBuilderQueries();
    },
    onError: (error) => notifyError(error),
  });

  const unpublishMutation = useMutation({
    mutationFn: async (page: SiteBuilderPageNode) => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      setRowProcessing(page.id, true);
      try {
        return await unpublishWorkspaceSitePage(String(workspaceId), page.id);
      } finally {
        setRowProcessing(page.id, false);
      }
    },
    onSuccess: async () => {
      notifySuccessText(t("content_library:SITE_BUILDER_TOAST_UNPUBLISH_SUCCESS"));
      await refreshBuilderQueries();
    },
    onError: (error) => notifyError(error),
  });

  const openEditor = (page: SiteBuilderPageNode) => {
    if (!workspaceId) return;
    openStudioPageEditor({
      workspaceId: String(workspaceId),
      pageId: page.id,
    });
  };

  return (
    <>
      <DefaultPage
        width="fixed"
        title={t("nav:NAV_CONTENT_SITE_BUILDER")}
        description={t("content_library:SITE_BUILDER_PAGE_DESC")}
        action={
          <Button
            type="primary"
            icon={<Plus size={16} />}
            autoInsertSpace={false}
            onClick={() => setDialogOpen(true)}
          >
            {t("content_library:SITE_BUILDER_MANAGE_PAGES")}
          </Button>
        }
      >
        <ContentGuard
          loading={pagesQuery.isLoading}
          error={pagesQuery.error}
          empty={empty}
          onRetry={() => void pagesQuery.refetch()}
          container="raw"
          emptyTitle={t("content_library:SITE_BUILDER_EMPTY_TITLE")}
          emptyDescription={t("content_library:SITE_BUILDER_EMPTY_DESC")}
        >
          <div className="grid gap-4">
            <SiteBuilderMetrics
              draftCount={draftCount}
              globalCount={globalSections.length}
              pageCount={pages.length}
              publishedCount={publishedCount}
              t={t}
            />
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <PageListCard
                pages={pages}
                processingIds={processingIds}
                onOpenEditor={openEditor}
                onPublish={(page) => void publishMutation.mutateAsync(page)}
                onUnpublish={(page) => void unpublishMutation.mutateAsync(page)}
                t={t}
              />
              <GlobalSectionsCard
                error={globalSectionsQuery.error}
                isLoading={globalSectionsQuery.isLoading}
                items={globalSections}
                onRetry={() => void globalSectionsQuery.refetch()}
                t={t}
              />
            </div>
          </div>
        </ContentGuard>
      </DefaultPage>

      <CreateSitePageDialog
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
