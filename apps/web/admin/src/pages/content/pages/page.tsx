import { Modal, Input as AntInput } from "antd";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// Editor overlay is opened inline; no hard route jump required in MVP.

import {
  createWorkspaceSitePage,
  listWorkspaceSitePagesTree,
  type SitePageTreeNode,
} from "@/api/workspace-site";
import { DefaultPage } from "@/components/common/default-page";
import { PageState } from "@/components/common/page-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from "@/components/ui/expandable-screen";
import { ContentPageEditorView } from "@/pages/content/pages/editor";

function flattenTree(
  nodes: SitePageTreeNode[],
  level = 0,
): Array<{ node: SitePageTreeNode; level: number }> {
  const out: Array<{ node: SitePageTreeNode; level: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, level });
    const children = Array.isArray(n.children) ? n.children : [];
    out.push(...flattenTree(children, level + 1));
  }
  return out;
}

export function ContentPagesIndexView() {
  const { t } = useTranslation(["nav", "common", "content_pages"]);
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const queryClient = useQueryClient();

  const pagesQuery = useQuery({
    queryKey: ["site", "pages", "tree", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return listWorkspaceSitePagesTree(String(workspaceId));
    },
    staleTime: 30 * 1000,
    retry: false,
    meta: { silent: true },
  });

  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [newPath, setNewPath] = React.useState("/about");

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("WORKSPACE_NOT_SELECTED");
      return createWorkspaceSitePage(String(workspaceId), { path: newPath });
    },
    onSuccess: () => {
      notifySuccessText(t("common:REQUEST_SUCCESS"));
      setCreateModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["site", "pages", "tree", workspaceId] });
    },
    onError: (err) => notifyError(err),
  });

  const rows = React.useMemo(() => {
    const tree = pagesQuery.data?.items ?? [];
    return flattenTree(tree);
  }, [pagesQuery.data?.items]);

  return (
    <DefaultPage title={t("nav:NAV_CONTENT_PAGES")}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {t("content_pages:TOTAL_LABEL")}: {pagesQuery.data?.total ?? 0}
        </div>
        <Button type="button" onClick={() => setCreateModalOpen(true)}>
          {t("content_pages:ACTION_CREATE_PAGE")}
        </Button>
      </div>

      <PageState
        className="mt-4"
        loading={pagesQuery.isLoading}
        error={pagesQuery.error}
        empty={
          !pagesQuery.isLoading && !pagesQuery.error && (pagesQuery.data?.items?.length ?? 0) === 0
        }
        onRetry={() => pagesQuery.refetch()}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("content_pages:COL_PATH")}</TableHead>
              <TableHead>{t("content_pages:COL_VISIBILITY")}</TableHead>
              <TableHead>{t("content_pages:COL_DRAFT")}</TableHead>
              <TableHead>{t("content_pages:COL_PUBLISHED")}</TableHead>
              <TableHead className="text-right">{t("content_pages:COL_ACTIONS")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ node, level }) => {
              const indent = Math.min(level, 6) * 12;
              return (
                <TableRow key={node.id}>
                  <TableCell>
                    <div style={{ paddingLeft: indent }} className="font-mono text-sm">
                      {node.path}
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{node.visibility}</TableCell>
                  <TableCell>{node.draftRevision}</TableCell>
                  <TableCell>{node.publishedRevision ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <ExpandableScreen layoutId={`page-editor:${node.id}`}>
                      <ExpandableScreenTrigger>
                        <Button type="button" variant="secondary" size="sm">
                          {t("content_pages:ACTION_EDIT")}
                        </Button>
                      </ExpandableScreenTrigger>
                      <ExpandableScreenContent
                        className="bg-background"
                        closeButtonClassName="text-foreground bg-muted hover:bg-muted/70"
                      >
                        {workspaceId ? (
                          <ContentPageEditorView
                            workspaceId={String(workspaceId)}
                            pageId={node.id}
                            layout="overlay"
                          />
                        ) : null}
                      </ExpandableScreenContent>
                    </ExpandableScreen>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </PageState>

      <Modal
        title={t("content_pages:MODAL_CREATE_TITLE")}
        open={createModalOpen}
        okText={t("content_pages:ACTION_CREATE_PAGE")}
        cancelText={t("common:CANCEL")}
        confirmLoading={createMutation.isPending}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createMutation.mutate()}
      >
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">{t("content_pages:FIELD_PATH_LABEL")}</div>
          <AntInput
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="/about"
          />
          <div className="text-xs text-muted-foreground">{t("content_pages:FIELD_PATH_HELP")}</div>
        </div>
      </Modal>
    </DefaultPage>
  );
}
