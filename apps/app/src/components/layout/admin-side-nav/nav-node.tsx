import { useNavigate, type NavigateOptions } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Fragment, type ReactNode } from "react";
import { Collapsible, CollapsibleContent } from "@arclayer/ui/collapsible";
import { cn } from "@arclayer/lib/utils";

import type { AdminNavItem } from "@/types/admin-nav";
import {
  findPreferredGroupTarget,
  isExactMatch,
  resolveLeadingLabel,
  resolveNavSectionKey,
  type OpenGroupKeys,
} from "./nav-utils";
import { useBlockedTooltipText } from "./blocked-tooltip";
import type { CollapsedDropdownController } from "./collapsed-dropdown";
import { FavoritesNode } from "./favorites-node";
import type { ResolvedChildItem } from "./node-collapsed-group";
import { NodeLeaf } from "./node-leaf";
import { NodeAction } from "./node-action";
import { NodeExpandedGroupRoot, NodeExpandedGroupSub } from "./node-expanded-group";
import { NavDivider, NavGroupMarker } from "./nav-markers";

type NodeProps = {
  item: AdminNavItem;
  commandNavItems: readonly AdminNavItem[];
  depth: number;
  parentKey: string;
  pathname: string;
  activeSource: "base" | "starred";
  activeKeys: ReadonlySet<string>;
  baseActiveKeys: ReadonlySet<string>;
  starredActiveKeys: ReadonlySet<string>;
  suppressedKeys: ReadonlySet<string>;
  openGroupKeys: OpenGroupKeys;
  openChainForKey: (key: string) => void;
  selectActiveSource: (source: "base" | "starred", targetPath?: string) => void;
  resolvePermissionName?: (code: string) => string | null;
  isCollapsed: boolean;
  hoverDropdown: CollapsedDropdownController | null;
  collapsedNavKeys: ReadonlySet<string>;
  onToggleSection: (key: string) => void;
};

type TFn = (key: string) => string;

function resolveLabel(t: TFn, item: AdminNavItem): string {
  if (item.labelKey) return t(item.labelKey);
  return item.label;
}

function resolveCollapsedChildren(
  t: TFn,
  item: AdminNavItem,
  activeKeys: ReadonlySet<string>,
  suppressedKeys: ReadonlySet<string>,
): ResolvedChildItem[] {
  return (item.children ?? []).map((child) => ({
    key: child.key,
    label: resolveLabel(t, child),
    to: child.to,
    disabled: Boolean(child.disabled),
    isActive:
      !suppressedKeys.has(child.key) && (activeKeys.has(child.key) || Boolean(child.isActive)),
    Icon: child.icon,
  }));
}

type NavNodeListProps = Omit<NodeProps, "item" | "depth" | "parentKey"> & {
  items: readonly AdminNavItem[];
  depth: number;
  parentKey: string;
};

type NavListSegment = {
  key: string;
  label: string | null;
  sectionKey: string | null;
  items: AdminNavItem[];
};

const NAV_SECTION_CONTENT_CLASSNAME = cn(
  "flex flex-col gap-1 overflow-hidden",
  "motion-reduce:animate-none",
  "data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out]",
  "data-[state=closed]:animate-[arclayer-collapsible-up_140ms_ease-out]",
);

function buildNavListSegments(
  items: readonly AdminNavItem[],
  parentKey: string,
  t: TFn,
): NavListSegment[] {
  const segments: NavListSegment[] = [];

  for (const item of items) {
    const label = resolveLeadingLabel(item, t);
    const sectionKey = label ? resolveNavSectionKey(parentKey, item) : null;
    if (sectionKey) {
      segments.push({ key: sectionKey, label, sectionKey, items: [item] });
      continue;
    }

    const current = segments.at(-1);
    if (current?.sectionKey) {
      current.items.push(item);
      continue;
    }

    if (current) current.items.push(item);
    else
      segments.push({
        key: `${parentKey}:ungrouped`,
        label: null,
        sectionKey: null,
        items: [item],
      });
  }

  return segments;
}

function renderNavItems(items: readonly AdminNavItem[], props: NavNodeListProps) {
  return items.map((item) => (
    <Fragment key={item.key}>
      {item.dividerBefore ? <NavDivider /> : null}
      <NavNode {...props} item={item} depth={props.depth} parentKey={props.parentKey} />
      {item.dividerAfter ? <NavDivider /> : null}
    </Fragment>
  ));
}

function sectionContentId(sectionKey: string): string {
  return `admin-side-nav-${sectionKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function NavNodeList(props: NavNodeListProps): ReactNode {
  const { t } = useTranslation();
  const segments = buildNavListSegments(props.items, props.parentKey, t);

  return segments.map((segment) => {
    const sectionKey = segment.sectionKey;
    if (!sectionKey || !segment.label) {
      return <Fragment key={segment.key}>{renderNavItems(segment.items, props)}</Fragment>;
    }

    const isOpen = !props.collapsedNavKeys.has(sectionKey);
    if (props.isCollapsed && !isOpen) return null;

    const contentId = sectionContentId(sectionKey);
    return (
      <Collapsible key={segment.key} open={isOpen} asChild>
        <li className="contents">
          <NavGroupMarker
            label={segment.label}
            isOpen={isOpen}
            contentId={contentId}
            onToggle={() => props.onToggleSection(sectionKey)}
          />
          <CollapsibleContent id={contentId} asChild>
            <ul className={NAV_SECTION_CONTENT_CLASSNAME}>
              {renderNavItems(segment.items, props)}
            </ul>
          </CollapsibleContent>
        </li>
      </Collapsible>
    );
  });
}

function renderExpandedGroupNode(args: {
  item: AdminNavItem;
  depth: number;
  isCollapsed: boolean;
  isOpen: boolean;
  isTrailActive: boolean;
  label: string;
  blockedTooltip: string | null;
  hoverDropdown: CollapsedDropdownController | null;
  collapsedChildren: readonly ResolvedChildItem[];
  collapsedNavigateTarget: string | null;
  onNavigate: (to: string) => void;
  childNodes: ReactNode;
  onToggle: () => void;
}) {
  if (args.depth > 0) {
    return (
      <NodeExpandedGroupSub
        item={args.item}
        label={args.label}
        isOpen={args.isOpen}
        isTrailActive={args.isTrailActive}
        blockedTooltip={args.blockedTooltip}
        onToggle={args.onToggle}
      >
        {args.childNodes}
      </NodeExpandedGroupSub>
    );
  }

  return (
    <NodeExpandedGroupRoot
      item={args.item}
      label={args.label}
      isCollapsed={args.isCollapsed}
      isOpen={args.isOpen}
      isTrailActive={args.isTrailActive}
      blockedTooltip={args.blockedTooltip}
      hoverDropdown={args.hoverDropdown}
      collapsedChildren={args.collapsedChildren}
      collapsedNavigateTarget={args.collapsedNavigateTarget}
      onNavigate={args.onNavigate}
      onToggle={args.onToggle}
    >
      {args.childNodes}
    </NodeExpandedGroupRoot>
  );
}

function renderActionNode(args: {
  item: AdminNavItem;
  depth: number;
  label: string;
  isCollapsed: boolean;
  hoverDropdown: CollapsedDropdownController | null;
}) {
  return (
    <NodeAction
      item={args.item}
      depth={args.depth}
      isCollapsed={args.isCollapsed}
      label={args.label}
      isActive={Boolean(args.item.isActive)}
      hoverDropdown={args.hoverDropdown}
    />
  );
}

function renderLeafNode(args: {
  item: AdminNavItem;
  depth: number;
  isCollapsed: boolean;
  label: string;
  pathname: string;
  isSelected: boolean;
  blockedTooltip: string | null;
  openChainForKey: (key: string) => void;
  selectActiveSource: (targetPath?: string) => void;
  allowSamePathNavigate: boolean;
  hoverDropdown: CollapsedDropdownController | null;
}) {
  return (
    <NodeLeaf
      item={args.item}
      depth={args.depth}
      isCollapsed={args.isCollapsed}
      label={args.label}
      pathname={args.pathname}
      isSelected={args.isSelected}
      blockedTooltip={args.blockedTooltip}
      openChainForKey={args.openChainForKey}
      onSelect={args.selectActiveSource}
      allowSamePathNavigate={args.allowSamePathNavigate}
      hoverDropdown={args.hoverDropdown}
    />
  );
}

function resolveGroupNavigateTarget(item: AdminNavItem, activeKeys: ReadonlySet<string>) {
  if (item.groupBehavior === "navigate-self-and-expand" && item.to) {
    return item.to;
  }

  return findPreferredGroupTarget(item, activeKeys);
}

function createExpandedGroupToggle(args: {
  item: AdminNavItem;
  isOpen: boolean;
  openChainForKey: (key: string) => void;
  navigate: (opts: NavigateOptions) => Promise<unknown>;
  activeKeys: ReadonlySet<string>;
  selectActiveSource: (targetPath?: string) => void;
  pathname: string;
  allowSamePathNavigate: boolean;
}) {
  const navTarget = resolveGroupNavigateTarget(args.item, args.activeKeys);

  return () => {
    if (args.item.disabled) return;
    args.selectActiveSource(navTarget ?? undefined);
    const wasOpen = args.isOpen;
    args.openChainForKey(args.item.key);
    if (
      !wasOpen &&
      navTarget &&
      (args.allowSamePathNavigate || !isExactMatch(navTarget, args.pathname))
    ) {
      void args.navigate({ to: navTarget as never });
    }
  };
}

function NavNodeImpl(
  props: NodeProps,
  t: TFn,
  navigate: (opts: NavigateOptions) => Promise<unknown>,
) {
  const item = props.item;
  const label = resolveLabel(t, item);
  const branchSource =
    item.key === "favorites" || props.parentKey === "favorites" ? "starred" : "base";
  const allowSamePathNavigate = branchSource === props.activeSource;
  const branchActiveKeys =
    branchSource === "starred" ? props.starredActiveKeys : props.baseActiveKeys;
  const hasChildren = Boolean(item.children?.length);
  const isOpen = hasChildren && !item.disabled && props.openGroupKeys.has(item.key);
  const blockedTooltip = useBlockedTooltipText(item, props.resolvePermissionName);
  const isSuppressed = props.suppressedKeys.has(item.key);
  const isTrailActive = !isSuppressed && (props.activeKeys.has(item.key) || Boolean(item.isActive));
  const selectBranchSource = (targetPath?: string) =>
    props.selectActiveSource(branchSource, targetPath);

  if (item.key === "favorites" && props.depth === 0) {
    return (
      <FavoritesNode
        item={item}
        label={label}
        isCollapsed={props.isCollapsed}
        isTrailActive={isTrailActive}
        pathname={props.pathname}
        activeKeys={props.activeKeys}
        suppressedKeys={props.suppressedKeys}
        allowSamePathNavigate={allowSamePathNavigate}
        onSelectPath={selectBranchSource}
      />
    );
  }

  if (!hasChildren && !item.to) {
    return renderActionNode({
      item,
      depth: props.depth,
      label,
      isCollapsed: props.isCollapsed,
      hoverDropdown: props.hoverDropdown,
    });
  }

  if (!hasChildren) {
    return renderLeafNode({
      item,
      depth: props.depth,
      isCollapsed: props.isCollapsed,
      label,
      pathname: props.pathname,
      isSelected: !isSuppressed && (props.activeKeys.has(item.key) || Boolean(item.isActive)),
      blockedTooltip,
      openChainForKey: props.openChainForKey,
      selectActiveSource: selectBranchSource,
      allowSamePathNavigate,
      hoverDropdown: props.hoverDropdown,
    });
  }

  return renderExpandedGroupNode({
    item,
    depth: props.depth,
    isCollapsed: props.isCollapsed,
    isOpen,
    isTrailActive,
    label,
    blockedTooltip,
    hoverDropdown: props.hoverDropdown,
    collapsedChildren: resolveCollapsedChildren(t, item, props.activeKeys, props.suppressedKeys),
    collapsedNavigateTarget: resolveGroupNavigateTarget(item, branchActiveKeys),
    onNavigate: (to) => {
      selectBranchSource(to);
      if (!allowSamePathNavigate && isExactMatch(to, props.pathname)) return;
      void navigate({ to: to as never });
    },
    childNodes: (
      <NavNodeList
        {...props}
        items={item.children ?? []}
        depth={props.depth + 1}
        parentKey={item.key}
      />
    ),
    onToggle: createExpandedGroupToggle({
      item,
      isOpen,
      openChainForKey: props.openChainForKey,
      navigate,
      activeKeys: branchActiveKeys,
      selectActiveSource: selectBranchSource,
      pathname: props.pathname,
      allowSamePathNavigate,
    }),
  });
}

export function NavNode(props: NodeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return NavNodeImpl(props, t, navigate);
}
