import { useNavigate, type NavigateOptions } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Fragment, type ReactNode } from "react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { OpenGroupKeys } from "./nav-utils";
import { findPreferredGroupTarget, isExactMatch } from "./nav-utils";
import { useBlockedTooltipText } from "./blocked-tooltip";
import type { CollapsedDropdownController } from "./collapsed-dropdown";
import { FavoritesNode } from "./favorites-node";
import type { ResolvedChildItem } from "./node-collapsed-group";
import { NodeLeaf } from "./node-leaf";
import { NodeAction } from "./node-action";
import { NodeExpandedGroupRoot, NodeExpandedGroupSub } from "./node-expanded-group";
import { NavDivider, NavGroupMarker, resolveLeadingLabel } from "./nav-markers";

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

function renderChildNodes(props: NodeProps, t: TFn): ReactNode {
  const children = props.item.children ?? [];
  if (children.length === 0) return null;

  return children.map((child) => {
    const leadingLabel = resolveLeadingLabel(child, t);

    return (
      <Fragment key={child.key}>
        {leadingLabel ? <NavGroupMarker label={leadingLabel} /> : null}
        {child.dividerBefore ? <NavDivider /> : null}
        <NavNode
          item={child}
          commandNavItems={props.commandNavItems}
          depth={props.depth + 1}
          parentKey={props.item.key}
          pathname={props.pathname}
          activeSource={props.activeSource}
          activeKeys={props.activeKeys}
          baseActiveKeys={props.baseActiveKeys}
          starredActiveKeys={props.starredActiveKeys}
          suppressedKeys={props.suppressedKeys}
          openGroupKeys={props.openGroupKeys}
          openChainForKey={props.openChainForKey}
          selectActiveSource={props.selectActiveSource}
          resolvePermissionName={props.resolvePermissionName}
          isCollapsed={props.isCollapsed}
          hoverDropdown={props.hoverDropdown}
        />
        {child.dividerAfter ? <NavDivider /> : null}
      </Fragment>
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
    childNodes: renderChildNodes(props, t),
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
