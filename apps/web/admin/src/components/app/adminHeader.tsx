import { Breadcrumb, Button, Space } from "antd";
import type { BreadcrumbProps } from "antd";
import type { BreadcrumbItemProps } from "antd/es/breadcrumb/BreadcrumbItem";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";

import type { AdminNavItem } from "@/constants/admin-nav";
import { cn } from "@/lib/utils";
import { AdminLocaleToggle } from "@/components/app/adminToggleLocales";
import { AdminThemeModeToggle } from "@/components/app/adminToggleTheme";
import { CommandMenu01 } from "@/components/ui/command-menu";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import RefreshIcon from "@/components/ui/icons/refresh-icon";
import SettingsIcon from "@/components/ui/icons/settings-icon";

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

function findActiveTrailNodes(items: AdminNavItem[], pathname: string): AdminNavItem[] {
  let bestScore = -1;
  let bestTrail: AdminNavItem[] = [];

  const dfs = (nodes: AdminNavItem[], parents: AdminNavItem[]) => {
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

  // Flatten to a single-level menu: Breadcrumb menu type intentionally supports only a simple list.
  const walk = (node: AdminNavItem, trailLabels: string[]) => {
    const selfLabel = node.labelKey ? t(node.labelKey) : node.label;
    const nextTrail = [...trailLabels, selfLabel];

    if (node.to) {
      // Show relative path labels (e.g. "Level 2 / Level 3") to keep the menu informative.
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

  // Include root itself (if it has a route), then descendants.
  // For breadcrumb UX, a section dropdown should offer "go to this section page" if available.
  if (root.to) {
    const rootLabel = root.labelKey ? t(root.labelKey) : root.label;
    items.push({
      key: root.to,
      label: renderLabel(root, rootLabel),
    });
  }

  // Descendants use relative labels (exclude the root label).
  if (root.children?.length) {
    for (const child of root.children) {
      walk(child, []);
    }
  }

  return items;
}

export function AdminHeader(props: {
  navItems: AdminNavItem[];
  className?: string;
  onRefresh?: () => Promise<void> | void;
  refreshing?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [refreshHovered, setRefreshHovered] = useState(false);
  const [settingsHovered, setSettingsHovered] = useState(false);

  const trailNodes = useMemo(
    () => findActiveTrailNodes(props.navItems, pathname),
    [props.navItems, pathname],
  );

  const breadcrumbItems = useMemo<BreadcrumbProps["items"]>(() => {
    if (!trailNodes.length) return [];

    return trailNodes.map((node, index) => {
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
          <Link to={node.to} className="text-muted-foreground hover:text-foreground">
            {titleContent}
          </Link>
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

      return {
        title,
        menu,
      };
    });
  }, [navigate, t, trailNodes]);

  return (
    <header
      className={cn(
        "h-14 w-full shrink-0 border-b bg-background px-4",
        "flex items-center justify-between gap-4",
        props.className,
      )}
    >
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <Button
          aria-label={t("common:REFRESH")}
          type="text"
          size="large"
          style={{ width: 44, height: 44, paddingInline: 0 }}
          disabled={!props.onRefresh || props.refreshing}
          onMouseEnter={() => setRefreshHovered(true)}
          onMouseLeave={() => setRefreshHovered(false)}
          onClick={() => void props.onRefresh?.()}
          icon={
            props.refreshing ? (
              <RefreshIcon size={18} duration={0.8} loop className="text-current" />
            ) : (
              <RefreshIcon size={18} isHovered={refreshHovered} className="text-current" />
            )
          }
        />

        <Breadcrumb items={breadcrumbItems} />
      </div>

      <div className="shrink-0">
        <Space size={6}>
          <Button
            variant="text"
            icon={<Search size={18} />}
            onClick={() => setCommandOpen(true)}
            className="h-9"
          >
            <span>{t("command:CMD_SEARCH")}</span>
            <KbdGroup className="ml-2">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </Button>

          <AdminLocaleToggle />
          <AdminThemeModeToggle />

          <Button
            aria-label={t("account:ACCOUNT_PERSONAL_SETTINGS")}
            type="text"
            size="large"
            style={{ width: 44, height: 44, paddingInline: 0 }}
            onMouseEnter={() => setSettingsHovered(true)}
            onMouseLeave={() => setSettingsHovered(false)}
            icon={<SettingsIcon size={18} isHovered={settingsHovered} className="text-current" />}
            onClick={() => {
              // TODO: route not implemented yet; wire to settings page when available.
            }}
          />
        </Space>
      </div>

      <CommandMenu01 open={commandOpen} onOpenChange={setCommandOpen} navItems={props.navItems} />
    </header>
  );
}
