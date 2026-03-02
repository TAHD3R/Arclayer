import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactElement,
} from "react";
import { useTranslation } from "react-i18next";
import type { AdminNavItem } from "@/types/admin-nav";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import ChevronRightIcon from "@/components/ui/icons/chevron-right";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useFavoritesStore } from "@/stores/use-favorites-store";

const NAV_ITEM_BASE_PADDING_LEFT = 20;
const NAV_ITEM_HEIGHT_CLASSNAME = "h-10";

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
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{props.children}</span>
      </TooltipTrigger>
      <TooltipContent>{props.tooltip}</TooltipContent>
    </Tooltip>
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
        // Treat leaf items as active when a deeper route is visited (e.g. /settings/workspace/basics).
        // This enables auto-expansion and consistent active styling for index-like menu nodes.
        const isTrail = isPrefixMatch(node.to, pathname);
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
      index.set(node.key, { key: node.key, parentKey, isGroup: Boolean(node.children?.length) });
      if (node.children?.length) walk(node.children, node.key);
    }
  };
  walk(items, "__root__");
  return index;
}

type OpenByParent = Record<string, string | undefined>;

function getFirstDescendantTo(item: AdminNavItem): string | null {
  if (item.to && !item.disabled) return item.to;
  if (!item.children?.length) return null;
  for (const child of item.children) {
    const found = getFirstDescendantTo(child);
    if (found) return found;
  }
  return null;
}

function iconSlot(
  depth: number,
  Icon: AdminNavItem["icon"] | undefined,
  opts?: {
    isActive?: boolean;
  },
) {
  if (depth === 0 && Icon) {
    return (
      <span
        className={cn(
          "size-5 shrink-0 inline-flex items-center justify-center",
          opts?.isActive ? "text-primary" : null,
        )}
        aria-hidden="true"
      >
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
  resolvePermissionName,
}: NodeProps) {
  const { t } = useTranslation(["admin_menu"]);
  const navigate = useNavigate();

  const label = item.labelKey ? t(item.labelKey) : item.label;
  const hasChildren = Boolean(item.children?.length);
  const isOpen = hasChildren && !item.disabled && openByParent[parentKey] === item.key;
  const isSelected = !hasChildren && activeKeys.has(item.key);
  const Icon = item.icon;
  const isSectionActive = depth === 0 && hasChildren && activeKeys.has(item.key);
  const isTrailActive = activeKeys.has(item.key);
  const blockedTooltip = getBlockedTooltipText(item, t, resolvePermissionName);
  const isSubLevel = depth > 0;

  const interactiveTransition = cn(
    "transition-[color,background-color,transform,box-shadow] duration-200 ease-out",
    "motion-reduce:transition-none",
  );
  const rootActiveIndicator = !isSubLevel
    ? cn(
        "before:absolute before:left-2 before:top-1/2 before:-translate-y-1/2",
        "before:h-4 before:w-1 before:rounded-full",
        "before:bg-primary/60 before:opacity-0 before:scale-y-75",
        "before:transition-[opacity,transform] before:duration-200",
        "motion-reduce:before:transition-none",
        "data-[active=true]:before:opacity-100 data-[active=true]:before:scale-y-100",
      )
    : null;

  // Pure button item (no route, no children) — e.g. Support, Notifications
  if (!hasChildren && !item.to) {
    const TrailingIcon = item.trailingIcon;
    const forcedActive = Boolean(item.isActive);
    const showAction = depth === 0 && Boolean(item.actionRenderer);

    if (isSubLevel) {
      return (
        <SidebarMenuSubItem className="group/nav-item">
          <SidebarMenuSubButton
            asChild
            isActive={forcedActive}
            className={cn(
              "relative z-10 cursor-pointer",
              NAV_ITEM_HEIGHT_CLASSNAME,
              "rounded-lg",
              interactiveTransition,
              "text-callout",
              "text-label-secondary! hover:text-label-primary!",
              "hover:bg-card data-[active=true]:bg-accent/50",
              "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
              "data-[active=true]:translate-x-0.5",
              forcedActive && "font-semibold text-foreground!",
            )}
          >
            <button type="button" onClick={item.onAction}>
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {TrailingIcon ? (
                <TrailingIcon
                  className="ml-auto size-3.5 shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      );
    }

    return (
      <SidebarMenuItem className="group/nav-item">
        <SidebarMenuButton
          isActive={forcedActive}
          className={cn(
            "relative z-10 cursor-pointer",
            NAV_ITEM_HEIGHT_CLASSNAME,
            "rounded-lg",
            interactiveTransition,
            rootActiveIndicator,
            "text-label-secondary! hover:text-label-primary!",
            depth === 0
              ? "bg-transparent hover:bg-card/80 data-[active=true]:bg-accent/50"
              : "hover:bg-card data-[active=true]:bg-accent/50",
            forcedActive && "font-semibold text-foreground!",
            "data-[active=true]:translate-x-0.5",
          )}
          style={{ paddingLeft: NAV_ITEM_BASE_PADDING_LEFT } as CSSProperties}
          onClick={item.onAction}
        >
          {iconSlot(depth, Icon, { isActive: forcedActive })}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {showAction && item.actionRenderer ? (
            <span
              className={cn(
                "ml-auto shrink-0",
                item.position === "footer"
                  ? null
                  : "opacity-0 group-hover/nav-item:opacity-100 transition-opacity",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {item.actionRenderer(item)}
            </span>
          ) : null}
          {TrailingIcon ? (
            <TrailingIcon
              className="ml-auto size-3.5 shrink-0 text-label-secondary"
              aria-hidden="true"
            />
          ) : null}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  // Leaf item with route
  if (!hasChildren) {
    if (isSubLevel) {
      return (
        <SidebarMenuSubItem className="group/nav-item">
          <WithBlockedTooltip tooltip={blockedTooltip}>
            <SidebarMenuSubButton
              asChild
              isActive={isSelected}
              aria-disabled={item.disabled ? "true" : undefined}
              className={cn(
                "relative z-10",
                NAV_ITEM_HEIGHT_CLASSNAME,
                "rounded-lg",
                interactiveTransition,
                "text-callout",
                "text-label-secondary! hover:text-label-primary!",
                "hover:bg-card data-[active=true]:bg-accent/50",
                "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
                "data-[active=true]:translate-x-0.5",
                item.disabled
                  ? cn(
                      "opacity-60",
                      "hover:text-label-secondary!",
                      "cursor-not-allowed",
                      "aria-disabled:pointer-events-auto",
                    )
                  : null,
              )}
            >
              <Link
                to={item.to!}
                aria-current={item.to && isExactMatch(item.to, pathname) ? "page" : undefined}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  openChainForKey(item.key);
                  if (!item.disabled) return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
              </Link>
            </SidebarMenuSubButton>
          </WithBlockedTooltip>
        </SidebarMenuSubItem>
      );
    }

    return (
      <SidebarMenuItem className="group/nav-item">
        <WithBlockedTooltip tooltip={blockedTooltip}>
          <SidebarMenuButton
            asChild
            isActive={isSelected}
            aria-disabled={item.disabled ? "true" : undefined}
            className={cn(
              "relative z-10",
              NAV_ITEM_HEIGHT_CLASSNAME,
              "rounded-lg",
              interactiveTransition,
              rootActiveIndicator,
              "text-label-secondary! hover:text-label-primary!",
              depth === 0
                ? "bg-transparent hover:bg-card/80 data-[active=true]:bg-accent/50"
                : "hover:bg-card data-[active=true]:bg-accent/50",
              "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
              "data-[active=true]:translate-x-0.5",
              item.disabled
                ? cn(
                    "opacity-60",
                    "hover:text-label-secondary!",
                    "cursor-not-allowed",
                    "aria-disabled:pointer-events-auto",
                  )
                : null,
            )}
            style={{ paddingLeft: NAV_ITEM_BASE_PADDING_LEFT } as CSSProperties}
          >
            <Link
              to={item.to!}
              aria-current={item.to && isExactMatch(item.to, pathname) ? "page" : undefined}
              onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                openChainForKey(item.key);
                if (!item.disabled) return;
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {iconSlot(depth, Icon, { isActive: isSelected })}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {depth === 0 && item.actionRenderer ? (
                <span
                  className="opacity-0 group-hover/nav-item:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {item.actionRenderer(item)}
                </span>
              ) : null}
            </Link>
          </SidebarMenuButton>
        </WithBlockedTooltip>
      </SidebarMenuItem>
    );
  }

  // Parent item with children — collapsible accordion
  const navTarget = item.children?.[0] ? getFirstDescendantTo(item.children[0]) : null;

  if (isSubLevel) {
    return (
      <Collapsible open={isOpen}>
        <SidebarMenuSubItem className="group/nav-item">
          <WithBlockedTooltip tooltip={blockedTooltip}>
            <SidebarMenuSubButton
              asChild
              isActive={isTrailActive}
              aria-disabled={item.disabled ? "true" : undefined}
              className={cn(
                "relative z-10",
                NAV_ITEM_HEIGHT_CLASSNAME,
                "rounded-lg",
                interactiveTransition,
                "text-callout",
                "text-label-secondary! hover:text-label-primary!",
                "hover:bg-card data-[active=true]:bg-accent/50",
                "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
                "data-[active=true]:translate-x-0.5",
                item.disabled
                  ? cn(
                      "opacity-60",
                      "hover:text-label-secondary!",
                      "cursor-not-allowed",
                      "aria-disabled:pointer-events-auto",
                    )
                  : "hover:cursor-pointer",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  if (item.disabled) return;
                  const wasOpen = isOpen;
                  openChainForKey(item.key);
                  if (!wasOpen && navTarget) {
                    navigate({ to: navTarget });
                  }
                }}
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <ChevronRightIcon
                  size={16}
                  expanded={isOpen}
                  className="ml-auto shrink-0 text-label-secondary"
                  aria-hidden="true"
                />
              </button>
            </SidebarMenuSubButton>
          </WithBlockedTooltip>

          <CollapsibleContent
            className={cn(
              "pt-1.5 overflow-hidden",
              "motion-reduce:animate-none",
              "data-[state=open]:animate-[celestial-collapsible-down_180ms_ease-out]",
              "data-[state=closed]:animate-[celestial-collapsible-up_160ms_ease-in]",
            )}
          >
            <SidebarMenuSub className="gap-0.5 border-border/60 mx-0 ml-5">
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
                  resolvePermissionName={resolvePermissionName}
                />
              ))}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuSubItem>
      </Collapsible>
    );
  }

  return (
    <Collapsible open={isOpen}>
      <SidebarMenuItem
        data-section-active={isSectionActive ? "true" : "false"}
        className="group/nav-item"
      >
        <WithBlockedTooltip tooltip={blockedTooltip}>
          <SidebarMenuButton
            isActive={isTrailActive}
            aria-disabled={item.disabled ? "true" : undefined}
            className={cn(
              "relative z-10",
              NAV_ITEM_HEIGHT_CLASSNAME,
              "rounded-lg",
              interactiveTransition,
              rootActiveIndicator,
              "text-label-secondary! hover:text-label-primary!",
              "bg-transparent hover:bg-card/80 data-[active=true]:bg-accent/50",
              "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
              "data-[active=true]:translate-x-0.5",
              item.disabled
                ? cn(
                    "opacity-60",
                    "hover:text-label-secondary!",
                    "cursor-not-allowed",
                    "aria-disabled:pointer-events-auto",
                  )
                : "hover:cursor-pointer",
            )}
            style={{ paddingLeft: NAV_ITEM_BASE_PADDING_LEFT } as CSSProperties}
            onClick={() => {
              if (item.disabled) return;
              const wasOpen = isOpen;
              openChainForKey(item.key);
              if (!wasOpen && navTarget) {
                navigate({ to: navTarget });
              }
            }}
          >
            {iconSlot(depth, Icon, { isActive: isTrailActive })}
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {depth === 0 && item.actionRenderer ? (
              <span
                className="opacity-0 group-hover/nav-item:opacity-100 transition-opacity shrink-0"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                {item.actionRenderer(item)}
              </span>
            ) : null}
            <ChevronRightIcon
              size={16}
              expanded={isOpen}
              className="ml-auto shrink-0 text-label-secondary"
              aria-hidden="true"
            />
          </SidebarMenuButton>
        </WithBlockedTooltip>

        <CollapsibleContent
          className={cn(
            "pt-1.5 overflow-hidden",
            "motion-reduce:animate-none",
            "data-[state=open]:animate-[celestial-collapsible-down_180ms_ease-out]",
            "data-[state=closed]:animate-[celestial-collapsible-up_160ms_ease-in]",
          )}
        >
          <SidebarMenuSub className="gap-0.5 border-border/60 mx-0 ml-5">
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
                resolvePermissionName={resolvePermissionName}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function findNavItemByPath(items: readonly AdminNavItem[], path: string): AdminNavItem | null {
  for (const item of items) {
    if (item.to && normalizePath(item.to) === normalizePath(path)) return item;
    if (item.children) {
      const found = findNavItemByPath(item.children, path);
      if (found) return found;
    }
  }
  return null;
}

export function AdminSiderNav(props: {
  items: readonly AdminNavItem[];
  resolvePermissionName?: (code: string) => string | null;
  className?: string;
}) {
  const { t } = useTranslation(["admin_menu"]);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const favoritePaths = useFavoritesStore((s) => s.paths);
  const navIndex = useMemo(() => buildNavIndex(props.items), [props.items]);

  const activeTrail = useMemo(
    () => findActiveTrail(props.items, pathname),
    [props.items, pathname],
  );
  const activeKeys = useMemo(() => new Set(activeTrail), [activeTrail]);

  const [openByParent, setOpenByParent] = useState<OpenByParent>({});

  const openChainForKey = (key: string) => {
    setOpenByParent((prev) => {
      const entry = navIndex.get(key);
      if (!entry) return prev;
      // Toggle: if already open at this parent, close it
      if (entry.isGroup && prev[entry.parentKey] === key) {
        const next = { ...prev };
        delete next[entry.parentKey];
        return next;
      }
      // Build open chain from key up to root
      const next: OpenByParent = {};
      let current = key;
      for (;;) {
        const e = navIndex.get(current);
        if (!e) break;
        if (e.isGroup) next[e.parentKey] = current;
        if (e.parentKey === "__root__") break;
        current = e.parentKey;
      }
      return next;
    });
  };

  const favoriteItems = useMemo(() => {
    const resolved: Array<{ path: string; label: string; Icon: AdminNavItem["icon"] }> = [];
    for (const path of favoritePaths) {
      const item = findNavItemByPath(props.items, path);
      if (!item) continue;
      const label = item.labelKey ? t(item.labelKey) : item.label;
      resolved.push({ path, label, Icon: item.icon });
    }
    return resolved;
  }, [favoritePaths, props.items, t]);

  return (
    <nav className={cn("mt-4 mb-8", props.className)}>
      {favoriteItems.length > 0 ? (
        <>
          <SidebarGroup className="p-0 pb-0">
            <SidebarGroupContent>
              <SidebarMenu className="mb-0! gap-0 px-0">
                {favoriteItems.map((fav) => {
                  const isSelected = isExactMatch(fav.path, pathname);
                  const Icon = fav.Icon;
                  return (
                    <SidebarMenuItem key={fav.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={isSelected}
                        className={cn(
                          "relative z-10",
                          NAV_ITEM_HEIGHT_CLASSNAME,
                          "rounded-lg",
                          "transition-[color,background-color,transform,box-shadow] duration-200 ease-out motion-reduce:transition-none",
                          "before:absolute before:left-2 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-1 before:rounded-full before:bg-primary/60 before:opacity-0 before:scale-y-75 before:transition-[opacity,transform] before:duration-200 motion-reduce:before:transition-none data-[active=true]:before:opacity-100 data-[active=true]:before:scale-y-100",
                          "text-label-secondary! hover:text-label-primary!",
                          "bg-transparent hover:bg-card/80 data-[active=true]:bg-accent/50",
                          "data-[active=true]:font-semibold data-[active=true]:text-foreground!",
                          "data-[active=true]:translate-x-0.5",
                        )}
                        style={{ paddingLeft: NAV_ITEM_BASE_PADDING_LEFT } as CSSProperties}
                      >
                        <Link to={fav.path}>
                          {Icon ? (
                            <span
                              className="size-5 shrink-0 inline-flex items-center justify-center"
                              aria-hidden="true"
                            >
                              <Icon className="size-full" />
                            </span>
                          ) : (
                            <span className="size-5 shrink-0" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{fav.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarSeparator className="mx-5 my-2" />
        </>
      ) : null}

      <SidebarGroup className="p-0">
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5 px-0">
            {props.items.map((item) => (
              <Fragment key={item.key}>
                <NavNode
                  item={item}
                  depth={0}
                  parentKey="__root__"
                  pathname={pathname}
                  activeKeys={activeKeys}
                  openByParent={openByParent}
                  openChainForKey={openChainForKey}
                  resolvePermissionName={props.resolvePermissionName}
                />
                {item.dividerAfter ? <SidebarSeparator className="mx-5 my-1" /> : null}
              </Fragment>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  );
}
