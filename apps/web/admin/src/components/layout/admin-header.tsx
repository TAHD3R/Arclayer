import { Breadcrumb } from "antd";
import type { BreadcrumbProps } from "antd";
import type { BreadcrumbItemProps } from "antd/es/breadcrumb/BreadcrumbItem";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { AdminNavItem } from "@/constants/admin-nav";
import { cn } from "@/lib/utils";
import { AdminHeaderActions } from "@/components/layout/admin-header-actions";
import {
  AdminOrgSwitcher,
  AdminWorkspaceSwitcher,
} from "@/components/layout/admin-workspace-switcher";

function normalizePath(input: string): string {
  if (input.length > 1 && input.endsWith("/")) return input.slice(0, -1);
  return input;
}

function isExactMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  return p === t;
}

function isPrefixMatch(to: string, pathname: string): boolean {
  const t = normalizePath(to);
  const p = normalizePath(pathname);
  if (t === "/") return p === "/";
  return p === t || p.startsWith(`${t}/`);
}

function findActiveTrailNodes(items: readonly AdminNavItem[], pathname: string): AdminNavItem[] {
  let bestScore = -1;
  let bestTrail: AdminNavItem[] = [];

  const dfs = (nodes: readonly AdminNavItem[], parents: AdminNavItem[]) => {
    for (const node of nodes) {
      const nextParents = [...parents, node];

      if (node.to) {
        const isExact = isExactMatch(node.to, pathname);
        const isPrefix = isPrefixMatch(node.to, pathname);
        const score = isExact ? 1000 + node.to.length : isPrefix ? 100 + node.to.length : 0;
        if (score > 0 && score > bestScore) {
          bestScore = score;
          bestTrail = nextParents;
        }
      }

      if (node.children?.length) dfs(node.children, nextParents);
    }
  };

  dfs(items, []);
  return bestTrail;
}

function buildBreadcrumbMenuItems(
  root: AdminNavItem,
  t: (key: string) => string,
): NonNullable<BreadcrumbItemProps["menu"]>["items"] {
  const items: NonNullable<NonNullable<BreadcrumbItemProps["menu"]>["items"]> = [];

  const renderLabel = (node: AdminNavItem, text: string) => {
    const Icon = node.icon;
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 truncate">{text}</span>
      </span>
    );
  };

  const walk = (node: AdminNavItem, trailLabels: string[]) => {
    const selfLabel = node.labelKey ? t(node.labelKey) : node.label;
    const nextTrail = [...trailLabels, selfLabel];

    if (node.to) {
      const text = nextTrail.join(" / ");
      items.push({
        key: node.to,
        label: renderLabel(node, text),
      });
    }

    if (node.children?.length) {
      for (const child of node.children) {
        walk(child, nextTrail);
      }
    }
  };

  if (root.to) {
    const rootLabel = root.labelKey ? t(root.labelKey) : root.label;
    items.push({
      key: root.to,
      label: renderLabel(root, rootLabel),
    });
  }

  if (root.children?.length) {
    for (const child of root.children) {
      walk(child, []);
    }
  }

  return items;
}

// ─── AdminHeader ──────────────────────────────────────────────────────────────

export function AdminHeader(props: {
  navItems: readonly AdminNavItem[];
  className?: string;
  onRefresh?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { t } = useTranslation();

  const isWorkspaceScopeRoute = pathname.startsWith("/w/");

  const trailNodes = useMemo(
    () => findActiveTrailNodes(props.navItems, pathname),
    [props.navItems, pathname],
  );

  const breadcrumbItems = useMemo<BreadcrumbProps["items"]>(() => {
    const items: BreadcrumbProps["items"] = [];

    // 首节：组织切换器（始终渲染）
    items.push({
      title: <AdminOrgSwitcher />,
    });

    // 次节：工作区切换器（仅工作区路由）
    if (isWorkspaceScopeRoute) {
      items.push({
        title: <AdminWorkspaceSwitcher />,
      });
    }

    if (!trailNodes.length) return items;

    const navItems = trailNodes.map((node, index) => {
      const label = node.labelKey ? t(node.labelKey) : node.label;
      const Icon = node.icon;
      const hasChildren = Boolean(node.children?.length);
      const isLast = index === trailNodes.length - 1;

      const titleContent = (
        <span className="inline-flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
          <span className={cn("min-w-0 truncate", isLast ? "text-foreground" : undefined)}>
            {label}
          </span>
        </span>
      );

      const title =
        !isLast && !hasChildren && node.to ? (
          <button
            type="button"
            className="text-label-secondary hover:text-foreground transition-colors focus-visible:outline-none"
            onClick={() => void navigate({ to: node.to as never })}
          >
            {titleContent}
          </button>
        ) : (
          titleContent
        );

      const menu: BreadcrumbItemProps["menu"] | undefined = hasChildren
        ? {
            items: buildBreadcrumbMenuItems(node, t),
            onClick: (info) => {
              const key = String(info.key);
              navigate({ to: key as never });
            },
          }
        : undefined;

      return { title, menu };
    });

    return [...items, ...navItems];
  }, [navigate, isWorkspaceScopeRoute, t, trailNodes]);

  return (
    <header
      className={cn(
        "h-12 w-full shrink-0 border-b bg-background px-4",
        "flex items-center justify-between gap-4",
        props.className,
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <Breadcrumb items={breadcrumbItems} className="min-w-0 overflow-hidden whitespace-nowrap" />
      </div>

      <div className="shrink-0">
        <AdminHeaderActions onRefresh={props.onRefresh} />
      </div>
    </header>
  );
}
