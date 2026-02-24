import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { FileText, ChevronRight } from "lucide-react";

import { listWorkspaceSitePagesTree, type SitePageTreeNode } from "@/api/workspace-site";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";

function PageNode({ node, depth }: { node: SitePageTreeNode; depth: number }) {
  return (
    <>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-xs hover:bg-muted"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {node.children.length > 0 ? (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <FileText className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.title || node.path}</span>
      </button>
      {node.children.map((child) => (
        <PageNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function PagesPanel() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId } = useEditorConfig();

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
        <span className="text-xs text-muted-foreground">
          {t("content_pages:EDITOR_V2_PAGES_EMPTY", { defaultValue: "No pages yet" })}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {pages.map((node) => (
        <PageNode key={node.id} node={node} depth={0} />
      ))}
    </div>
  );
}
