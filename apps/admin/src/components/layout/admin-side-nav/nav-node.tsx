import { useNavigate, type NavigateOptions } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { OpenByParent } from "./nav-utils";
import { findPreferredGroupTarget } from "./nav-utils";
import { useBlockedTooltipText } from "./blocked-tooltip";
import type { CollapsedDropdownController } from "./collapsed-dropdown";
import type { ResolvedChildItem } from "./node-collapsed-group";
import { NodeLeaf } from "./node-leaf";
import { NodeAction } from "./node-action";
import { NodeExpandedGroupRoot, NodeExpandedGroupSub } from "./node-expanded-group";

type NodeProps = {
  item: AdminNavItem;
  depth: number;
  parentKey: string;
  pathname: string;
  activeKeys: ReadonlySet<string>;
  openByParent: OpenByParent;
  openChainForKey: (key: string) => void;
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
): ResolvedChildItem[] {
  return (item.children ?? []).map((child) => ({
    key: child.key,
    label: resolveLabel(t, child),
    to: child.to,
    disabled: Boolean(child.disabled),
    isActive: activeKeys.has(child.key) || Boolean(child.isActive),
    Icon: child.icon,
  }));
}

function renderChildNodes(props: NodeProps): ReactNode {
  const children = props.item.children ?? [];
  if (children.length === 0) return null;
  return children.map((child) => (
    <NavNode
      key={child.key}
      item={child}
      depth={props.depth + 1}
      parentKey={props.item.key}
      pathname={props.pathname}
      activeKeys={props.activeKeys}
      openByParent={props.openByParent}
      openChainForKey={props.openChainForKey}
      resolvePermissionName={props.resolvePermissionName}
      isCollapsed={props.isCollapsed}
      hoverDropdown={props.hoverDropdown}
    />
  ));
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
      hoverDropdown={args.hoverDropdown}
    />
  );
}

function createExpandedGroupToggle(args: {
  item: AdminNavItem;
  isOpen: boolean;
  openChainForKey: (key: string) => void;
  navigate: (opts: NavigateOptions) => Promise<unknown>;
  activeKeys: ReadonlySet<string>;
}) {
  const navTarget = findPreferredGroupTarget(args.item, args.activeKeys);

  return () => {
    if (args.item.disabled) return;
    const wasOpen = args.isOpen;
    args.openChainForKey(args.item.key);
    if (!wasOpen && navTarget) {
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
  const hasChildren = Boolean(item.children?.length);
  const isOpen = hasChildren && !item.disabled && props.openByParent[props.parentKey] === item.key;
  const blockedTooltip = useBlockedTooltipText(item, props.resolvePermissionName);
  const isTrailActive = props.activeKeys.has(item.key) || Boolean(item.isActive);

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
      isSelected: props.activeKeys.has(item.key) || Boolean(item.isActive),
      blockedTooltip,
      openChainForKey: props.openChainForKey,
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
    collapsedChildren: resolveCollapsedChildren(t, item, props.activeKeys),
    collapsedNavigateTarget: findPreferredGroupTarget(item, props.activeKeys),
    onNavigate: (to) => void navigate({ to: to as never }),
    childNodes: renderChildNodes(props),
    onToggle: createExpandedGroupToggle({
      item,
      isOpen,
      openChainForKey: props.openChainForKey,
      navigate,
      activeKeys: props.activeKeys,
    }),
  });
}

export function NavNode(props: NodeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return NavNodeImpl(props, t, navigate);
}
