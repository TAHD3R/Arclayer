import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { FileText, ChevronRight } from "lucide-react";

import { listWorkspaceSitePagesTree } from "@/api/workspace-site";
import type { SitePageTreeNode } from "@/types/api";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { getTreeIndentClass } from "@/pages/workspaces/editor/constants/tree-indent";
import { cn } from "@/lib/utils";

function PageNode({
  node,
  depth,
  onNavigate,
}: {
  node: SitePageTreeNode;
  depth: number;
  onNavigate: (pageId: string, pathname: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-1.5 rounded py-1 pr-2 text-left text-caption hover:bg-muted",
          getTreeIndentClass(depth),
        )}
        onClick={() => onNavigate(node.id, node.path)}
      >
        {node.children.length > 0 ? (
          <ChevronRight className="size-3 shrink-0 text-label-secondary" />
        ) : (
          <FileText className="size-3 shrink-0 text-label-secondary" />
        )}
        <span className="truncate">{node.title || node.path}</span>
      </button>
      {node.children.map((child) => (
        <PageNode key={child.id} node={child} depth={depth + 1} onNavigate={onNavigate} />
      ))}
    </>
  );
}

export function PagesPanel() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId } = useEditorConfig();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["workspace", workspaceId, "site", "pages", "tree"],
    queryFn: () => listWorkspaceSitePagesTree(workspaceId),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  const pages = data?.items ?? [];

  if (pages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <span className="text-caption text-label-secondary">
          {t("content_pages:EDITOR_PAGE_PICKER_EMPTY_STATIC")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {pages.map((node) => (
        <PageNode
          key={node.id}
          node={node}
          depth={0}
          onNavigate={(pageId, pathname) =>
            void navigate({
              to: "/w/$workspaceId/editor/$editorMode/$entityId",
              params: {
                workspaceId,
                editorMode: "page",
                entityId: pageId,
              },
              search: { pathname },
            })
          }
        />
      ))}
    </div>
  );
}
