import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, FileText, Search } from "lucide-react";
import { Input } from "antd";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { listWorkspaceSitePagesTree, type SitePageTreeNode } from "@/api/workspace-site";
import { getWorkspaceDetail } from "@/api/workspaces";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useAuthStore } from "@/stores/use-auth-store";
import { cn } from "@/lib/utils";

const listContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
};

const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.2, 0, 0, 1] } },
};

/** 将页面树扁平化为一维列表 */
function flattenPages(nodes: SitePageTreeNode[]): SitePageTreeNode[] {
  const result: SitePageTreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenPages(node.children));
    }
  }
  return result;
}

function normalizeSearch(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function PageListPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation(["content_pages"]);
  const { closeFloatingPanel } = useFloatingPanel();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["workspace", workspaceId, "site", "pages", "tree"],
    queryFn: () => listWorkspaceSitePagesTree(workspaceId),
    staleTime: 30 * 1000,
  });

  const pages = useMemo(() => flattenPages(data?.items ?? []), [data?.items]);

  const filtered = useMemo(() => {
    const keyword = normalizeSearch(search);
    if (!keyword) return pages;
    return pages.filter((p) => {
      const text = [p.title, p.path].map((v) => String(v || "").toLowerCase()).join(" ");
      return text.includes(keyword);
    });
  }, [search, pages]);

  return (
    <div className="flex h-[320px] w-72 flex-col overflow-hidden">
      <div className="flex items-center border-b border-border/60 p-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("content_pages:EDITOR_V2_PAGE_SWITCHER_SEARCH", {
            defaultValue: "Search pages...",
          })}
          allowClear
          variant="borderless"
          prefix={<Search className="size-4 text-label-secondary" />}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-footnote text-label-secondary">
            {t("content_pages:EDITOR_V2_PAGE_SWITCHER_EMPTY", {
              defaultValue: "No pages found",
            })}
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-0.5 px-2"
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {filtered.map((page) => (
              <motion.button
                key={page.id}
                variants={listItemVariants}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "text-label-secondary hover:bg-muted hover:text-foreground",
                )}
                onClick={() => {
                  closeFloatingPanel();
                  void navigate({
                    to: `/w/${workspaceId}/editor/page/${page.id}` as never,
                  });
                }}
              >
                <FileText className="size-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-footnote font-medium text-foreground">
                    {page.title || page.path}
                  </div>
                  <div className="truncate text-caption text-label-secondary">{page.path}</div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function EditorPageSwitcher() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId } = useEditorConfig();
  const accessToken = useAuthStore((s) => s.accessToken);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: () => getWorkspaceDetail(workspaceId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const workspaceName = workspaceDetailQuery.data?.name ?? "";
  const pageName = t("content_pages:EDITOR_V2_PAGE_SWITCHER_CURRENT", {
    defaultValue: "Current page",
  });

  const triggerClassName = cn(
    "flex items-center gap-1.5 rounded-md px-2.5 py-1",
    "text-footnote border-0 bg-transparent",
    "hover:bg-accent hover:text-foreground",
    "data-[state=open]:bg-accent data-[state=open]:text-foreground",
    "transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );

  return (
    <FloatingPanelRoot>
      <FloatingPanelTrigger
        title={t("content_pages:EDITOR_V2_PAGE_SWITCHER_TITLE", {
          defaultValue: "Switch page",
        })}
        className={triggerClassName}
      >
        <span className="max-w-48 truncate text-label-secondary">{workspaceName || "..."}</span>
        <span className="text-label-secondary/50">/</span>
        <span className="max-w-32 truncate font-medium">{pageName}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="bottom" showTitle={false} className="p-0">
        <PageListPanel workspaceId={workspaceId} />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}
