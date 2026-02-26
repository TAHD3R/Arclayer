import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronsUpDown, ChevronRight, FileText, Search } from "lucide-react";
import { Button, Input } from "antd";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

import { listWorkspaceSitePagesTree } from "@/api/workspace-site";
import { getWorkspaceDetail } from "@/api/workspaces";
import type { SitePageTreeNode } from "@/types/api";
import {
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@/components/ui/floating-panel";
import { useEditorConfig } from "@/pages/workspaces/editor/contexts/editor-config-context";
import { useAuthStore } from "@/stores/use-auth-store";
import { cn } from "@/lib/utils";
import { getTreeIndentClass } from "@/pages/workspaces/editor/constants/tree-indent";
import { useEditorStore } from "@/pages/workspaces/editor/stores/editor-store";

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

function findPageNodeById(nodes: SitePageTreeNode[], id: string): SitePageTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children.length > 0) {
      const found = findPageNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function normalizeSearch(input: string): string {
  return String(input || "")
    .trim()
    .toLowerCase();
}

function PageTreeNodeRow(props: {
  node: SitePageTreeNode;
  depth: number;
  currentPageId: string | null;
  collapsedIds: Set<string>;
  toggleCollapsed: (id: string) => void;
  onNavigate: (pageId: string, pathname: string) => void;
}) {
  const { node, depth, currentPageId, collapsedIds, toggleCollapsed, onNavigate } = props;

  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsedIds.has(node.id);
  const isCurrent = Boolean(currentPageId && node.id === currentPageId);

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded py-1 pr-2 text-left text-caption",
          getTreeIndentClass(depth),
          isCurrent ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label="Toggle"
            className="flex size-6 items-center justify-center rounded hover:bg-muted/70"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleCollapsed(node.id);
            }}
          >
            <ChevronRight
              className={cn(
                "size-3 shrink-0 text-label-secondary transition-transform",
                isCollapsed ? null : "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="flex size-6 items-center justify-center">
            <FileText className="size-3 shrink-0 text-label-secondary" />
          </span>
        )}

        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left"
          onClick={() => onNavigate(node.id, node.path)}
          title={node.path}
        >
          {node.title || node.path}
        </button>
      </div>

      {hasChildren && !isCollapsed
        ? node.children.map((child) => (
            <PageTreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              currentPageId={currentPageId}
              collapsedIds={collapsedIds}
              toggleCollapsed={toggleCollapsed}
              onNavigate={onNavigate}
            />
          ))
        : null}
    </>
  );
}

function PageListPanel({
  workspaceId,
  currentPageId,
}: {
  workspaceId: string;
  currentPageId: string | null;
}) {
  const { t } = useTranslation(["content_pages"]);
  const { closeFloatingPanel } = useFloatingPanel();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const setActiveMenuId = useEditorStore((s) => s.setActiveMenuId);

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

  const toggleCollapsed = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onNavigate = (pageId: string, pathname: string) => {
    closeFloatingPanel();
    void navigate({
      to: "/w/$workspaceId/editor/$editorMode/$entityId",
      params: {
        workspaceId,
        editorMode: "page",
        entityId: pageId,
      },
      search: { pathname },
    });
  };

  return (
    <div className="flex h-[320px] w-72 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 p-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("content_pages:EDITOR_PAGE_PICKER_SEARCH_PLACEHOLDER")}
          allowClear
          variant="borderless"
          prefix={<Search className="size-4 text-label-secondary" />}
        />
        <Button
          size="small"
          type="text"
          onClick={() => {
            closeFloatingPanel();
            setActiveMenuId("pages");
          }}
        >
          {t("content_pages:EDITOR_MENU_PAGES")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-footnote text-label-secondary">
            {t("content_pages:EDITOR_PAGE_PICKER_EMPTY_STATIC")}
          </div>
        ) : normalizeSearch(search) ? (
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
                  page.id === currentPageId
                    ? "bg-accent text-accent-foreground"
                    : "text-label-secondary hover:bg-muted hover:text-foreground",
                )}
                onClick={() => onNavigate(page.id, page.path)}
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
        ) : (
          <div className="flex flex-col gap-0.5 p-1">
            {(data?.items ?? []).map((node) => (
              <PageTreeNodeRow
                key={node.id}
                node={node}
                depth={0}
                currentPageId={currentPageId}
                collapsedIds={collapsedIds}
                toggleCollapsed={toggleCollapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EditorPageSwitcher() {
  const { t } = useTranslation(["content_pages"]);
  const { workspaceId, entityId, editorMode } = useEditorConfig();
  const accessToken = useAuthStore((s) => s.accessToken);
  const overlayCloseSignal = useEditorStore((s) => s.overlayCloseSignal);

  const workspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", workspaceId],
    enabled: Boolean(accessToken && workspaceId),
    queryFn: () => getWorkspaceDetail(workspaceId),
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

  const workspaceName = workspaceDetailQuery.data?.name ?? "";
  const pagesQuery = useQuery({
    queryKey: ["workspace", workspaceId, "site", "pages", "tree"],
    queryFn: () => listWorkspaceSitePagesTree(workspaceId),
    enabled: Boolean(workspaceId) && editorMode === "page",
    staleTime: 30 * 1000,
    meta: { silent: true },
  });

  const currentPage = useMemo(() => {
    if (editorMode !== "page") return null;
    const nodes = pagesQuery.data?.items ?? [];
    return findPageNodeById(nodes, entityId);
  }, [editorMode, entityId, pagesQuery.data?.items]);

  const pageName =
    currentPage?.title || currentPage?.path || t("content_pages:EDITOR_PAGE_PICKER_CURRENT");

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
      {/* Close when the iframe takes focus (click inside canvas). */}
      <CloseOnOverlaySignal signal={overlayCloseSignal} />
      <FloatingPanelTrigger
        title={t("content_pages:EDITOR_MENU_PAGE_SWITCH")}
        aria-label={t("content_pages:EDITOR_PAGE_SWITCHER_TRIGGER")}
        className={triggerClassName}
      >
        <span className="max-w-48 truncate text-label-secondary">{workspaceName || "..."}</span>
        <span className="text-label-secondary/50">/</span>
        <span className="max-w-32 truncate font-medium" title={currentPage?.path || undefined}>
          {pageName}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </FloatingPanelTrigger>

      <FloatingPanelContent placement="bottom" showTitle={false} className="p-0">
        <PageListPanel
          workspaceId={workspaceId}
          currentPageId={editorMode === "page" ? entityId : null}
        />
      </FloatingPanelContent>
    </FloatingPanelRoot>
  );
}

function CloseOnOverlaySignal({ signal }: { signal: number }) {
  const { isOpen, closeFloatingPanel } = useFloatingPanel();
  const lastSignalRef = useRef(signal);

  // Close floating panel when the outer iframe receives focus (signal emitted by host shell).
  // This avoids "stuck open" popovers when users click inside the iframe.
  useEffect(() => {
    // Only close when the signal actually changes.
    // Avoid "open -> immediately close" due to the effect running on open state changes.
    if (signal === lastSignalRef.current) return;
    lastSignalRef.current = signal;

    if (!isOpen) return;
    closeFloatingPanel();
  }, [closeFloatingPanel, isOpen, signal]);

  return null;
}
