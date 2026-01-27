import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";

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
  if (item.to) return item.to;
  if (!item.children?.length) return null;
  for (const child of item.children) {
    const found = getFirstDescendantTo(child);
    if (found) return found;
  }
  return null;
}

function findActiveTrail(items: AdminNavItem[], pathname: string): string[] {
  let bestScore = -1;
  let bestKeys: string[] = [];

  const dfs = (nodes: AdminNavItem[], parents: string[]) => {
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

function buildNavIndex(items: AdminNavItem[]): Map<string, NavIndexEntry> {
  const index = new Map<string, NavIndexEntry>();

  const walk = (nodes: AdminNavItem[], parentKey: string) => {
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
}: NodeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);

  const label = item.labelKey ? t(item.labelKey) : item.label;
  const hasChildren = Boolean(item.children?.length);
  const isOpen = hasChildren && openByParent[parentKey] === item.key;
  const isSelected = Boolean(item.to && isExactMatch(item.to, pathname));
  const Icon = item.icon;
  const isSectionActive = depth === 0 && hasChildren && activeKeys.has(item.key);
  const isTrailActive = activeKeys.has(item.key);
  const showActiveIndicator = depth === 0 && (isSelected || isSectionActive);

  const openSelf = () => {
    if (!hasChildren) return;
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
        <SidebarMenuButton
          asChild
          isActive={isSelected}
          className={cn(
            "rounded-none relative z-10",
            "transition-[width,height,padding,color] duration-150 ease-out",
            "text-muted-foreground! hover:text-foreground! hover:bg-transparent! active:bg-transparent!",
            "data-[active=true]:font-semibold data-[active=true]:bg-transparent! data-[active=true]:text-foreground!",
          )}
          style={
            {
              paddingLeft: 24 + Math.max(0, depth - 1) * 12,
            } as CSSProperties
          }
        >
          <Link
            to={item.to!}
            aria-current={isSelected ? "page" : undefined}
            onClick={() => openChainForKey(item.key)}
          >
            {iconSlot(depth, Icon)}
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </Link>
        </SidebarMenuButton>
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
        <SidebarMenuButton
          isActive={isTrailActive}
          className={cn(
            "rounded-none relative z-10",
            "transition-[width,height,padding,color] duration-150 ease-out",
            "text-muted-foreground! hover:text-foreground! hover:bg-transparent! active:bg-transparent!",
            "data-[active=true]:font-semibold data-[active=true]:bg-transparent! data-[active=true]:text-foreground!",
            "hover:cursor-pointer",
          )}
          style={
            {
              paddingLeft: 24 + Math.max(0, depth - 1) * 12,
            } as CSSProperties
          }
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => {
            setAnimateOpenKey(item.key);
            openSelf();
            if (navTarget) {
              navigate({ to: navTarget });
            }
          }}
        >
          {iconSlot(depth, Icon)}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <ChevronRightIcon
            size={16}
            expanded={isOpen}
            isHovered={hovered}
            className="ml-auto shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </SidebarMenuButton>

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
                />
              ))}
            </SidebarMenu>
          </motion.div>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function AdminSiderNav(props: { items: AdminNavItem[] }) {
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
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
