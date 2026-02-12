import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Tooltip as AntdTooltip } from "antd";

import type { AdminNavItem } from "@/constants/admin-nav";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import ChevronRightIcon from "@/components/ui/icons/chevron-right";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const NAV_ITEM_BASE_PADDING_LEFT = 20;

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

function getFirstDescendantTo(item: AdminNavItem): string | null {
  if (item.to && !item.disabled) return item.to;
  if (!item.children?.length) return null;
  for (const child of item.children) {
    const found = getFirstDescendantTo(child);
    if (found) return found;
  }
  return null;
}

function getBlockedTooltipText(
  item: AdminNavItem,
  t: (key: string, opts?: Record<string, unknown>) => string,
  resolvePermissionName: ((code: string) => string | null) | undefined,
): string | null {
  if (!item.disabled) return null;
  if (item.blockedReason === "plugin_disabled") {
    return t("admin_menu:MENU_BLOCKED_PLUGIN_DISABLED");
  }
  if (item.blockedReason === "missing_permission") {
    const permCode = item.requiredPermission || "admin:access";
    const permissionName = resolvePermissionName?.(permCode) ?? null;
    if (permissionName) {
      return t("admin_menu:MENU_BLOCKED_MISSING_PERMISSION", { permissionName });
    }
    return t("admin_menu:MENU_BLOCKED_MISSING_PERMISSION_FALLBACK");
  }
  return t("admin_menu:MENU_BLOCKED_GENERIC");
}

function WithBlockedTooltip(props: { tooltip: string | null; children: ReactElement }) {
  if (!props.tooltip) return props.children;
  return (
    <AntdTooltip title={props.tooltip} placement="top">
      <span className="block w-full">{props.children}</span>
    </AntdTooltip>
  );
}

function findActiveTrail(items: readonly AdminNavItem[], pathname: string): string[] {
  let bestScore = -1;
  let bestKeys: string[] = [];

  const dfs = (nodes: readonly AdminNavItem[], parents: string[]) => {
    for (const node of nodes) {
      const nextParents = [...parents, node.key];

      if (node.to) {
        const isExact = isExactMatch(node.to, pathname);
        const isTrail = node.children?.length ? isPrefixMatch(node.to, pathname) : false;
        const score = isExact ? 1000 + node.to.length : isTrail ? 100 + node.to.length : 0;
        if (score > 0 && score > bestScore) {
          bestScore = score;
          bestKeys = nextParents;
        }
      }

      if (node.children?.length) dfs(node.children, nextParents);
    }
  };

  dfs(items, []);
  return bestKeys;
}

type NavIndexEntry = {
  key: string;
  parentKey: string;
  isGroup: boolean;
};

function buildNavIndex(items: readonly AdminNavItem[]): Map<string, NavIndexEntry> {
  const index = new Map<string, NavIndexEntry>();

  const walk = (nodes: readonly AdminNavItem[], parentKey: string) => {
    for (const node of nodes) {
      index.set(node.key, {
        key: node.key,
        parentKey,
        isGroup: Boolean(node.children?.length),
      });
      if (node.children?.length) walk(node.children, node.key);
    }
  };

  walk(items, "__root__");
  return index;
}

type OpenByParent = Record<string, string | undefined>;

function iconSlot(depth: number, Icon: AdminNavItem["icon"] | undefined) {
  if (depth === 0 && Icon) {
    return (
      <span className="size-5 shrink-0 inline-flex items-center justify-center" aria-hidden="true">
        <Icon className="size-full" />
      </span>
    );
  }
  return <span className="size-5 shrink-0" aria-hidden="true" />;
}

type NodeProps = {
  item: AdminNavItem;
  depth: number;
  parentKey: string;
  pathname: string;
  activeKeys: ReadonlySet<string>;
  openByParent: OpenByParent;
  openChainForKey: (key: string) => void;
  animateOpenKey: string | null;
  setAnimateOpenKey: (key: string | null) => void;
  resolvePermissionName?: (code: string) => string | null;
};

function NavNode({
  item,
  depth,
  parentKey,
  pathname,
  activeKeys,
  openByParent,
  openChainForKey,
  animateOpenKey,
  setAnimateOpenKey,
  resolvePermissionName,
}: NodeProps) {
  const { t } = useTranslation(["admin_menu"]);
  const navigate = useNavigate();

  const label = item.labelKey ? t(item.labelKey) : item.label;
  const hasChildren = Boolean(item.children?.length);
  const isOpen = hasChildren && !item.disabled && openByParent[parentKey] === item.key;
  const isSelected = Boolean(item.to && isExactMatch(item.to, pathname));
  const Icon = item.icon;
  const isSectionActive = depth === 0 && hasChildren && activeKeys.has(item.key);
  const isTrailActive = activeKeys.has(item.key);
  const showActiveIndicator = depth === 0 && (isSelected || isSectionActive);
  const blockedTooltip = getBlockedTooltipText(item, t, resolvePermissionName);

  const openSelf = () => {
    if (!hasChildren) return;
    if (item.disabled) return;
    openChainForKey(item.key);
  };

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        {showActiveIndicator ? (
          <motion.span
            layoutId="admin-sider-active-indicator"
            layout="position"
            className="absolute pointer-events-none z-30 inset-y-0 left-0 w-0.75 bg-sidebar-primary"
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          />
        ) : null}
        <WithBlockedTooltip tooltip={blockedTooltip}>
          <SidebarMenuButton
            asChild
            isActive={isSelected}
            aria-disabled={item.disabled ? "true" : undefined}
            className={cn(
              "rounded-none relative z-10",
              "h-10 pl-5",
              "transition-[width,height,padding,color] duration-150 ease-out",
              "text-muted-foreground! hover:text-foreground! hover:bg-transparent! active:bg-transparent!",
              "data-[active=true]:font-semibold data-[active=true]:bg-transparent! data-[active=true]:text-foreground!",
              item.disabled
                ? cn(
                    "opacity-60",
                    "hover:text-muted-foreground!",
                    "cursor-not-allowed",
                    // Override SidebarMenuButton's default aria-disabled pointer-events-none so tooltip still works.
                    "aria-disabled:pointer-events-auto",
                  )
                : null,
            )}
            style={
              {
                paddingLeft: NAV_ITEM_BASE_PADDING_LEFT,
              } as CSSProperties
            }
          >
            <Link
              to={item.to!}
              aria-current={isSelected ? "page" : undefined}
              onClick={(e) => {
                openChainForKey(item.key);
                if (!item.disabled) return;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {iconSlot(depth, Icon)}
              <span className="min-w-0 flex-1 truncate text-base">{label}</span>
            </Link>
          </SidebarMenuButton>
        </WithBlockedTooltip>
      </SidebarMenuItem>
    );
  }

  const navTarget = item.children?.[0] ? getFirstDescendantTo(item.children[0]) : null;
  const shouldAnimateOpen = animateOpenKey === item.key;

  return (
    <Collapsible open={isOpen}>
      <SidebarMenuItem data-section-active={isSectionActive ? "true" : "false"}>
        {showActiveIndicator ? (
          <motion.span
            layoutId="admin-sider-active-indicator"
            layout="position"
            className="absolute pointer-events-none z-30 inset-y-0 left-0 w-0.75 bg-sidebar-primary"
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          />
        ) : null}
        <WithBlockedTooltip tooltip={blockedTooltip}>
          <SidebarMenuButton
            isActive={isTrailActive}
            aria-disabled={item.disabled ? "true" : undefined}
            className={cn(
              "rounded-none relative z-10",
              "h-10 pl-5",
              "text-base",
              "transition-[width,height,padding,color] duration-150 ease-out",
              "text-muted-foreground! hover:text-foreground! hover:bg-transparent! active:bg-transparent!",
              "data-[active=true]:font-semibold data-[active=true]:bg-transparent! data-[active=true]:text-foreground!",
              item.disabled
                ? cn(
                    "opacity-60",
                    "hover:text-muted-foreground!",
                    "cursor-not-allowed",
                    "aria-disabled:pointer-events-auto",
                  )
                : "hover:cursor-pointer",
            )}
            style={
              {
                paddingLeft: NAV_ITEM_BASE_PADDING_LEFT,
              } as CSSProperties
            }
            onClick={() => {
              if (item.disabled) return;
              setAnimateOpenKey(item.key);
              openSelf();
              if (navTarget) {
                navigate({ to: navTarget });
              }
            }}
          >
            {iconSlot(depth, Icon)}
            <span className="min-w-0 flex-1 truncate  text-base">{label}</span>
            <ChevronRightIcon
              size={16}
              expanded={isOpen}
              className="ml-auto shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </WithBlockedTooltip>

        <CollapsibleContent>
          <motion.div
            // Only animate on user-triggered open; route-driven open should appear instantly.
            initial={shouldAnimateOpen ? { height: 0, opacity: 0 } : false}
            animate={{ height: "auto", opacity: 1 }}
            transition={
              shouldAnimateOpen ? { duration: 0.18, ease: [0.2, 0, 0, 1] } : { duration: 0 }
            }
            style={{ overflow: "hidden" }}
            onAnimationComplete={() => {
              // Avoid accidental animations on subsequent re-renders.
              if (shouldAnimateOpen) setAnimateOpenKey(null);
            }}
          >
            <SidebarMenu>
              {item.children!.map((child) => (
                <NavNode
                  key={child.key}
                  item={child}
                  depth={depth + 1}
                  parentKey={item.key}
                  pathname={pathname}
                  activeKeys={activeKeys}
                  openByParent={openByParent}
                  openChainForKey={openChainForKey}
                  animateOpenKey={animateOpenKey}
                  setAnimateOpenKey={setAnimateOpenKey}
                  resolvePermissionName={resolvePermissionName}
                />
              ))}
            </SidebarMenu>
          </motion.div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AdminSiderNav(props: {
  items: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navIndex = useMemo(() => buildNavIndex(props.items), [props.items]);
  const activeTrail = useMemo(
    () => findActiveTrail(props.items, pathname),
    [props.items, pathname],
  );
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);

  const [openByParent, setOpenByParent] = useState<OpenByParent>({});
  const [animateOpenKey, setAnimateOpenKey] = useState<string | null>(null);

  const openChainForKey = (key: string) => {
    setOpenByParent(() => {
      const next: OpenByParent = {};

      let current = key;
      for (;;) {
        const entry = navIndex.get(current);
        if (!entry) break;
        if (entry.isGroup) next[entry.parentKey] = current;
        if (entry.parentKey === "__root__") break;
        current = entry.parentKey;
      }

      return next;
    });
  };

  useEffect(() => {
    setOpenByParent(() => {
      const next: OpenByParent = {};
      for (const key of activeTrail) {
        const entry = navIndex.get(key);
        if (!entry?.isGroup) continue;
        next[entry.parentKey] = key;
      }
      return next;
    });
  }, [activeTrail, navIndex]);

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <SidebarMenu className="gap-2 px-0">
          {props.items.map((item) => (
            <NavNode
              key={item.key}
              item={item}
              depth={0}
              parentKey="__root__"
              pathname={pathname}
              activeKeys={activeKeys}
              openByParent={openByParent}
              openChainForKey={openChainForKey}
              animateOpenKey={animateOpenKey}
              setAnimateOpenKey={setAnimateOpenKey}
              resolvePermissionName={props.resolvePermissionName}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
