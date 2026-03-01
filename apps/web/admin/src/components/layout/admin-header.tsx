import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AdminNavItem } from "@/types/admin-nav";
import { cn } from "@/lib/utils";
import {
  AdminOrgSwitcher,
  AdminWorkspaceSwitcher,
  breadcrumbTriggerClassName,
} from "@/components/layout/admin-workspace-switcher";
import RefreshIcon from "@/components/ui/icons/refresh-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type BreadcrumbMenuItem = {
  key: string;
  label: ReactNode;
};

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
): BreadcrumbMenuItem[] {
  const items: BreadcrumbMenuItem[] = [];

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

function renderNavNodeTitle(node: AdminNavItem, t: (key: string) => string, isLast: boolean) {
  const label = node.labelKey ? t(node.labelKey) : node.label;
  const Icon = node.icon;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      <span className={cn("min-w-0 truncate", isLast ? "text-foreground" : undefined)}>
        {label}
      </span>
    </span>
  );
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
  const [refreshHovered, setRefreshHovered] = useState(false);

  const isWorkspaceScopeRoute = pathname.startsWith("/w/");

  const trailNodes = useMemo(
    () => findActiveTrailNodes(props.navItems, pathname),
    [props.navItems, pathname],
  );

  const breadcrumbNavItems = useMemo(() => {
    return trailNodes.map((node, index) => {
      const hasChildren = Boolean(node.children?.length);
      const isLast = index === trailNodes.length - 1;
      const menuItems = hasChildren ? buildBreadcrumbMenuItems(node, t) : null;
      return { node, hasChildren, isLast, menuItems };
    });
  }, [t, trailNodes]);

  return (
    <header
      className={cn(
        "h-12 w-full shrink-0 border-b bg-background px-2",
        "flex items-center gap-1",
        props.className,
      )}
    >
      {props.onRefresh != null ? (
        <button
          type="button"
          aria-label={t("common:REFRESH")}
          onMouseEnter={() => setRefreshHovered(true)}
          onMouseLeave={() => setRefreshHovered(false)}
          onClick={props.onRefresh}
          className={cn(
            "shrink-0 size-8 inline-flex items-center justify-center rounded-lg",
            "border-0 bg-transparent text-label-secondary",
            "hover:bg-muted hover:text-foreground",
            "transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <RefreshIcon size={16} isHovered={refreshHovered} className="text-current" />
        </button>
      ) : null}

      <nav
        aria-label="Breadcrumb"
        className="min-w-0 flex-1 h-full flex items-center overflow-hidden"
      >
        <ol className="m-0 mb-0! flex min-w-0 list-none items-center justify-start gap-1 overflow-hidden whitespace-nowrap p-0">
          <li className="shrink-0">
            <AdminOrgSwitcher />
          </li>

          {isWorkspaceScopeRoute ? (
            <>
              <li aria-hidden="true" className="shrink-0 text-label-secondary/60">
                <ChevronRight className="size-4" />
              </li>
              <li className="shrink-0">
                <AdminWorkspaceSwitcher />
              </li>
            </>
          ) : null}

          {breadcrumbNavItems.length
            ? breadcrumbNavItems.map(({ node, hasChildren, isLast, menuItems }) => {
                const content = renderNavNodeTitle(node, t, isLast);

                return (
                  <Fragment key={node.key}>
                    <li aria-hidden="true" className="shrink-0 text-label-secondary/60">
                      <ChevronRight className="size-4" />
                    </li>

                    <li className="min-w-0">
                      {hasChildren && menuItems?.length ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className={cn(breadcrumbTriggerClassName, "min-w-0")}
                            >
                              <span className="min-w-0 flex-1">{content}</span>
                              <ChevronDown
                                className="size-3 shrink-0 opacity-60"
                                aria-hidden="true"
                              />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                            {menuItems.map((it) => (
                              <DropdownMenuItem
                                key={it.key}
                                onSelect={() => {
                                  void navigate({ to: it.key as never });
                                }}
                              >
                                {it.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : !isLast && node.to ? (
                        <button
                          type="button"
                          className={cn(breadcrumbTriggerClassName, "min-w-0")}
                          onClick={() => void navigate({ to: node.to as never })}
                        >
                          {content}
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-foreground font-medium">
                          {content}
                        </span>
                      )}
                    </li>
                  </Fragment>
                );
              })
            : null}
        </ol>
      </nav>
    </header>
  );
}
