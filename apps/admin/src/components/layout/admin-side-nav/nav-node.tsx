import { useNavigate, type NavigateOptions } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";

import type { AdminNavItem } from "@/types/admin-nav";
import type { OpenByParent } from "./nav-utils";
import { getFirstDescendantTo } from "./nav-utils";
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

function resolveCollapsedChildren(t: TFn, item: AdminNavItem): ResolvedChildItem[] {
  return (item.children ?? []).map((child) => ({
    key: child.key,
    label: resolveLabel(t, child),
    to: child.to,
    disabled: Boolean(child.disabled),
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
      onNavigate={args.onNavigate}
      onToggle={args.onToggle}
    >
      {args.childNodes}
    </NodeExpandedGroupRoot>
  );
}

function renderActionNode(item: AdminNavItem, depth: number, label: string, isCollapsed: boolean) {
  return (
    <NodeAction
      item={item}
      depth={depth}
      isCollapsed={isCollapsed}
      label={label}
      isActive={Boolean(item.isActive)}
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
    />
  );
}

function createExpandedGroupToggle(args: {
  item: AdminNavItem;
  isOpen: boolean;
  openChainForKey: (key: string) => void;
  navigate: (opts: NavigateOptions) => Promise<unknown>;
}) {
  const navTarget = args.item.children?.[0] ? getFirstDescendantTo(args.item.children[0]) : null;
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
  const isTrailActive = props.activeKeys.has(item.key);

  if (!hasChildren && !item.to)
    return renderActionNode(item, props.depth, label, props.isCollapsed);

  if (!hasChildren) {
    return renderLeafNode({
      item,
      depth: props.depth,
      isCollapsed: props.isCollapsed,
      label,
      pathname: props.pathname,
      isSelected: props.activeKeys.has(item.key),
      blockedTooltip,
      openChainForKey: props.openChainForKey,
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
    collapsedChildren: resolveCollapsedChildren(t, item),
    onNavigate: (to) => void navigate({ to: to as never }),
    childNodes: renderChildNodes(props),
    onToggle: createExpandedGroupToggle({
      item,
      isOpen,
      openChainForKey: props.openChainForKey,
      navigate,
    }),
  });
}

export function NavNode(props: NodeProps) {
  const { t } = useTranslation(["admin_menu"]);
  const navigate = useNavigate();
  return NavNodeImpl(props, t, navigate);
}
