import { Fragment, type ComponentProps, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragOverEvent,
  type DragStartEvent,
  PointerSensor,
  type DragEndEvent,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@arclayer/lib/utils";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@arclayer/ui/breadcrumb";
import { Button as ButtonPrimitive } from "@arclayer/ui/button-primitive";
import { Collapsible, CollapsibleContent } from "@arclayer/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { ExpandableScreen, ExpandableScreenContent } from "@arclayer/ui/expandable-screen";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";
import { SidebarMenuButton, SidebarMenuItem } from "@arclayer/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@arclayer/ui/tooltip";
import {
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { getWorkspaceDetail } from "@/api/workspaces";
import {
  WorkspaceAvatar,
  workspaceAvatarPropsFromIdentity,
  type WorkspaceAvatarIdentity,
} from "@/components/common/entity-avatar";
import { GLOBAL_NAV_ITEMS } from "@/constants/menu/global";
import { getWorkspaceNavItems } from "@/constants/menu/workspaces";
import { buildFavoriteOverlayEmbedHref } from "@/lib/routing/favorite-overlay";
import { findActiveTrailNodes } from "@/lib/admin-nav-utils";
import { extractWorkspaceBaseFromPath, mapWorkspaceNavItems } from "@/layouts/admin-scene-utils";
import { useAuthStore } from "@/stores/use-auth-store";
import { useFavoritesStore } from "@/stores/use-favorites-store";
import type { FavoriteFolderNode, FavoriteNode } from "@/types/stores/favorites";
import type { AdminNavItem } from "@/types/admin-nav";
import {
  DISABLED_ITEM_CLASSNAME,
  INTERACTIVE_TRANSITION_CLASSNAME,
  NAV_ITEM_COLLAPSE_HIDE_CLASSNAME,
  NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
  NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
} from "./nav-node-styles";
import {
  NAV_ITEM_BUTTON_PADDING_CLASSNAME,
  NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
  NAV_ITEM_HEIGHT_CLASSNAME,
  NAV_ITEM_RADIUS_CLASSNAME,
  NAV_TRAILING_ICON_SLOT_CLASSNAME,
  NAV_SUBTREE_CLASSNAME,
  NAV_SUBTREE_GUIDE_CLASSNAME,
  normalizePath,
} from "./nav-utils";
import { iconSlot } from "./nav-icon-slot";

type FavoritesNodeProps = {
  item: AdminNavItem;
  label: string;
  isCollapsed: boolean;
  isTrailActive: boolean;
  pathname: string;
  activeKeys: ReadonlySet<string>;
  suppressedKeys: ReadonlySet<string>;
  allowSamePathNavigate: boolean;
  onSelectPath: (targetPath?: string) => void;
};

type FavoriteDisplayItem = {
  type: "item";
  key: string;
  sortId: string;
  label: string;
  path: string;
  isSelected: boolean;
};

type FavoriteDisplayFolder = {
  type: "folder";
  key: string;
  sortId: string;
  folderId: string;
  label: string;
  expanded: boolean;
  isSelected: boolean;
  children: FavoriteDisplayNode[];
};

type FavoriteDisplayNode = FavoriteDisplayItem | FavoriteDisplayFolder;

type FavoriteOverlayEntry = {
  label: string;
  href: string;
  embedHref: string;
};

type FavoriteOverlayBreadcrumbSegment = {
  key: string;
  label: string;
  icon?: AdminNavItem["icon"] | null;
  kind: "nav" | "workspace" | "plain";
  workspaceIdentity?: WorkspaceAvatarIdentity;
};

type FavoriteDragOverlayNode = {
  id: string;
  type: FavoriteDisplayNode["type"];
  label: string;
  expanded?: boolean;
};

type FavoriteDragContext = {
  activeId: string;
  activeType: FavoriteDisplayNode["type"];
  sourceParentId: string | null;
  folderDropTargetId: string | null;
};

type FavoriteInsertionTarget = {
  parentId: string | null;
  index: number;
};

type DragOverlayModifier = NonNullable<ComponentProps<typeof DragOverlay>["modifiers"]>[number];

const FAVORITES_COLLAPSIBLE_CONTENT_CLASSNAME = cn(
  "pt-1.5 overflow-hidden",
  "motion-reduce:animate-none",
  "data-[state=open]:animate-[arclayer-collapsible-down_180ms_ease-out]",
  "data-[state=closed]:animate-[arclayer-collapsible-up_160ms_ease-in]",
);

const FAVORITES_ACTION_BUTTON_CLASSNAME =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-label-secondary transition-colors hover:bg-accent/70 hover:text-label-primary";

const FAVORITES_TRAILING_CONTROLS_CLASSNAME =
  "ml-auto flex shrink-0 items-center gap-2 self-center";
const FAVORITES_ROW_ACTIONS_CLASSNAME = cn(
  FAVORITES_TRAILING_CONTROLS_CLASSNAME,
  "opacity-0 transition-opacity duration-150",
  "group-hover/favorite-row:opacity-100 group-focus-within/favorite-row:opacity-100",
);
const FAVORITE_OVERLAY_ICON_BUTTON_CLASSNAME =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-label-secondary transition-colors hover:bg-accent/70 hover:text-label-primary";

type PointerActivatorEvent = { clientX: number; clientY: number };
type TouchActivatorEvent = { touches: Array<PointerActivatorEvent> };

function getPointerActivatorPosition(event: unknown): PointerActivatorEvent | null {
  if (!event || typeof event !== "object") return null;

  if ("clientX" in event && "clientY" in event) {
    const pointerEvent = event as PointerActivatorEvent;
    return {
      clientX: Number(pointerEvent.clientX),
      clientY: Number(pointerEvent.clientY),
    };
  }

  if ("touches" in event) {
    const touchEvent = event as TouchActivatorEvent;
    const firstTouch = touchEvent.touches?.[0];
    if (!firstTouch) return null;
    return {
      clientX: Number(firstTouch.clientX),
      clientY: Number(firstTouch.clientY),
    };
  }

  return null;
}

const snapOverlayCenterToPointer: DragOverlayModifier = ({
  transform,
  activeNodeRect,
  overlayNodeRect,
  activatorEvent,
}) => {
  const base = {
    x: Number(transform?.x || 0),
    y: Number(transform?.y || 0),
    scaleX: Number.isFinite(transform?.scaleX) ? Number(transform.scaleX) : 1,
    scaleY: Number.isFinite(transform?.scaleY) ? Number(transform.scaleY) : 1,
  };

  if (!activeNodeRect || !overlayNodeRect || !activatorEvent) return base;

  const pointerPosition = getPointerActivatorPosition(activatorEvent);
  if (!pointerPosition) return base;

  const { clientX, clientY } = pointerPosition;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return base;

  const grabOffsetX = clientX - activeNodeRect.left;
  const grabOffsetY = clientY - activeNodeRect.top;

  return {
    ...base,
    x: base.x + grabOffsetX - overlayNodeRect.width / 2,
    y: base.y + grabOffsetY - overlayNodeRect.height / 2,
  };
};

function buildHref(path: string): string {
  return path;
}

function resolveNavLabel(item: AdminNavItem, t: (key: string) => string): string {
  return item.labelKey ? t(item.labelKey) : item.label;
}

function buildFavoriteOverlayBreadcrumbSegments(
  path: string,
  fallbackLabel: string,
  t: (key: string) => string,
  workspace?: ({ name?: string | null } & WorkspaceAvatarIdentity) | null,
): FavoriteOverlayBreadcrumbSegment[] {
  const normalizedPath = normalizePath(path);
  const workspaceBase = extractWorkspaceBaseFromPath(path);
  if (workspaceBase) {
    const navItems = mapWorkspaceNavItems(getWorkspaceNavItems(), workspaceBase);
    const trail = findActiveTrailNodes(navItems, normalizedPath);
    const workspaceSegment: FavoriteOverlayBreadcrumbSegment = {
      key: `workspace:${workspaceBase}`,
      label: workspace?.name?.trim() || workspaceBase.replace("/w/", ""),
      kind: "workspace",
      workspaceIdentity: workspace ?? undefined,
    };

    if (!trail.length) {
      return [
        workspaceSegment,
        {
          key: `current:${normalizedPath}`,
          label: fallbackLabel,
          kind: "plain",
        },
      ];
    }

    return [
      workspaceSegment,
      ...trail.map((item) => ({
        key: item.key,
        label: resolveNavLabel(item, t),
        icon: item.icon,
        kind: "nav" as const,
      })),
    ];
  }

  const trail = findActiveTrailNodes(GLOBAL_NAV_ITEMS, normalizedPath);
  if (!trail.length) {
    return [
      {
        key: `current:${normalizedPath}`,
        label: fallbackLabel,
        kind: "plain",
      },
    ];
  }

  return trail.map((item) => ({
    key: item.key,
    label: resolveNavLabel(item, t),
    icon: item.icon,
    kind: "nav" as const,
  }));
}

function favoriteContainerId(parentId: string | null): string {
  return `favorite-container:${parentId ?? "__root__"}`;
}

function parentIdFromContainerId(id: string): string | null {
  if (!id.startsWith("favorite-container:")) return null;
  const raw = id.slice("favorite-container:".length);
  return raw === "__root__" ? null : raw;
}

function favoriteInsertionId(parentId: string | null, index: number): string {
  return `favorite-insert:${parentId ?? "__root__"}:${index}`;
}

function parseInsertionId(id: string): FavoriteInsertionTarget | null {
  if (!id.startsWith("favorite-insert:")) return null;
  const raw = id.slice("favorite-insert:".length);
  const lastColonIndex = raw.lastIndexOf(":");
  if (lastColonIndex < 0) return null;

  const parentRaw = raw.slice(0, lastColonIndex);
  const indexRaw = raw.slice(lastColonIndex + 1);
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return null;

  return {
    parentId: parentRaw === "__root__" ? null : parentRaw,
    index,
  };
}

function isFavoriteFolderKey(key: string): boolean {
  return key.startsWith("favorite-folder:");
}

function favoriteFolderIdFromKey(key: string): string | null {
  return isFavoriteFolderKey(key) ? key.slice("favorite-folder:".length) : null;
}

function buildFolderStateMap(nodes: readonly FavoriteNode[]): Map<string, FavoriteFolderNode> {
  const result = new Map<string, FavoriteFolderNode>();

  const walk = (items: readonly FavoriteNode[]) => {
    for (const item of items) {
      if (item.type !== "folder") continue;
      result.set(item.id, item);
      walk(item.children);
    }
  };

  walk(nodes);
  return result;
}

function buildDisplayNodes(
  items: readonly AdminNavItem[],
  activeKeys: ReadonlySet<string>,
  suppressedKeys: ReadonlySet<string>,
  folderStateMap: ReadonlyMap<string, FavoriteFolderNode>,
): FavoriteDisplayNode[] {
  const next: FavoriteDisplayNode[] = [];
  for (const item of items) {
    if (item.to) {
      const path = normalizePath(item.to);
      next.push({
        type: "item",
        key: item.key,
        sortId: `item:${path}`,
        label: item.label,
        path,
        isSelected:
          !suppressedKeys.has(item.key) && (activeKeys.has(item.key) || Boolean(item.isActive)),
      });
      continue;
    }

    const folderId = favoriteFolderIdFromKey(item.key);
    if (!folderId || !item.children) continue;
    const folderState = folderStateMap.get(folderId);

    next.push({
      type: "folder",
      key: item.key,
      sortId: folderId,
      folderId,
      label: folderState?.name ?? item.label,
      expanded: folderState?.expanded ?? true,
      isSelected:
        !suppressedKeys.has(item.key) && (activeKeys.has(item.key) || Boolean(item.isActive)),
      children: buildDisplayNodes(item.children, activeKeys, suppressedKeys, folderStateMap),
    });
  }

  return next;
}

function buildDndMaps(nodes: readonly FavoriteDisplayNode[]) {
  const parentById = new Map<string, string | null>();
  const siblingIdsByParent = new Map<string | null, string[]>();

  const walk = (items: readonly FavoriteDisplayNode[], parentId: string | null) => {
    siblingIdsByParent.set(
      parentId,
      items.map((item) => item.sortId),
    );

    for (const item of items) {
      parentById.set(item.sortId, parentId);
      if (item.type === "folder") {
        walk(item.children, item.folderId);
      }
    }
  };

  walk(nodes, null);
  return { parentById, siblingIdsByParent };
}

function findDisplayNodeBySortId(
  nodes: readonly FavoriteDisplayNode[],
  sortId: string,
): FavoriteDisplayNode | null {
  for (const node of nodes) {
    if (node.sortId === sortId) return node;
    if (node.type === "folder") {
      const found = findDisplayNodeBySortId(node.children, sortId);
      if (found) return found;
    }
  }
  return null;
}

function FavoritesEmptyStateIllustration() {
  return (
    <svg
      width="28"
      height="25"
      viewBox="0 0 28 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-testid="favorites-empty-illustration"
      className="h-[25px] w-7 shrink-0"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.72678 9.31829L6.78489 11.1516C6.70545 11.3062 6.55725 11.4139 6.38564 11.4417L4.35096 11.7709L4.29099 11.4002L6.32566 11.071C6.37951 11.0623 6.42601 11.0285 6.45092 10.98L7.39282 9.14673L7.72678 9.31829ZM2.87081 12.0104L2.81082 11.6397L0.776145 11.9691C0.0348095 12.089 -0.260261 12.9972 0.268979 13.53L1.72154 14.9923L1.98792 14.7277L0.535356 13.2654C0.221499 12.9494 0.396485 12.4108 0.836121 12.3397L2.87081 12.0104ZM3.04461 15.7914L2.77824 16.0561L4.2308 17.5184C4.26923 17.5571 4.287 17.6118 4.27863 17.6657L3.96303 19.7025L4.33405 19.76L4.64967 17.7231C4.6763 17.5513 4.61968 17.3771 4.49717 17.2537L3.04461 15.7914ZM4.10445 21.2416L3.73343 21.1842L3.41781 23.2211C3.30281 23.9632 4.07533 24.5245 4.74559 24.1858L6.58521 23.2561L6.41588 22.9211L4.57626 23.8506C4.17877 24.0515 3.72065 23.7186 3.78884 23.2785L4.10445 21.2416ZM7.75413 22.2448L7.92347 22.5799L9.76308 21.6503C9.81177 21.6257 9.86924 21.6257 9.91792 21.6503L11.7575 22.5799L11.9269 22.2448L10.0873 21.3152C9.9321 21.2368 9.74891 21.2368 9.59375 21.3152L7.75413 22.2448ZM13.2651 22.9211L13.0958 23.2561L14.9355 24.1858C15.6057 24.5245 16.3781 23.9632 16.2633 23.2211L15.9476 21.1842L15.5766 21.2416L15.8921 23.2785C15.9604 23.7186 15.5022 24.0515 15.1047 23.8506L13.2651 22.9211ZM15.347 19.76L15.718 19.7025L15.4023 17.6657C15.3941 17.6118 15.4117 17.5571 15.4501 17.5184L16.9028 16.0561L16.6364 15.7914L15.1838 17.2537C15.0613 17.3771 15.0046 17.5513 15.0313 17.7231L15.347 19.76ZM17.6931 14.7277L17.9594 14.9923L19.412 13.53C19.9413 12.9972 19.6462 12.089 18.9048 11.9691L16.8702 11.6397L16.8102 12.0104L18.8449 12.3397C19.2845 12.4108 19.4595 12.9494 19.1457 13.2654L17.6931 14.7277ZM15.3301 11.7709L15.39 11.4002L13.3553 11.071C13.3015 11.0623 13.255 11.0285 13.2301 10.98L12.2882 9.14673L11.9542 9.31829L12.8961 11.1516C12.9755 11.3062 13.1238 11.4139 13.2954 11.4417L15.3301 11.7709ZM11.269 7.98455L11.603 7.81297L10.6611 5.97962C10.3179 5.31163 9.36307 5.31165 9.01989 5.97962L8.07801 7.81298L8.41197 7.98455L9.35385 6.15119C9.55737 5.75507 10.1236 5.75507 10.3272 6.15119L11.269 7.98455Z"
        fill="#6161FF"
      />
      <path d="M22.7735 1L21.4445 3.95305" stroke="#6161FF" strokeWidth="0.375458" />
      <path d="M25.801 2.77026L22.7742 4.68973" stroke="#6161FF" strokeWidth="0.375458" />
      <path
        d="M15.9779 3.87587C16.1527 3.32288 16.8797 3.19932 17.2274 3.66349L20.7799 8.40551C20.9156 8.58671 21.1294 8.69258 21.3558 8.69075L27.2806 8.64384C27.8606 8.63924 28.2027 9.29256 27.8687 9.76669L24.4565 14.6105C24.3261 14.7956 24.2915 15.0316 24.3631 15.2463L26.2388 20.8667C26.4224 21.4169 25.9068 21.9442 25.3527 21.7731L19.6915 20.0247C19.4751 19.9579 19.2399 19.9978 19.0578 20.1324L14.2921 23.653C13.8256 23.9975 13.1648 23.6702 13.1563 23.0904L13.0697 17.1658C13.0664 16.9394 12.9557 16.7281 12.7715 16.5965L7.95057 13.152C7.47868 12.8149 7.58581 12.0852 8.1347 11.898L13.7424 9.98486C13.9567 9.91173 14.1234 9.74109 14.1917 9.52521L15.9779 3.87587Z"
        fill="#FFCC00"
      />
    </svg>
  );
}

function EmptyFavoritesCard() {
  const { t } = useTranslation("nav");

  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-card/30 px-4 py-5">
      <div className="flex items-start gap-3">
        <FavoritesEmptyStateIllustration />
        <div className="min-w-0">
          <div className="text-callout font-semibold text-label-primary">
            {t("NAV_FAVORITES_EMPTY_TITLE")}
          </div>
          <p className="mt-1 text-caption text-label-secondary">
            {t("NAV_FAVORITES_EMPTY_DESCRIPTION")}
          </p>
        </div>
      </div>
    </div>
  );
}

function FolderDisclosureIcon(props: { open: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center text-label-secondary",
        props.className,
      )}
    >
      <svg
        viewBox="0 0 12 12"
        aria-hidden="true"
        className={cn(
          "size-2.5 fill-current transition-transform duration-200",
          props.open && "rotate-90",
        )}
      >
        <path d="M3 2.25L9 6L3 9.75V2.25Z" />
      </svg>
    </span>
  );
}

function FavoriteItemMenu(props: {
  row: FavoriteDisplayItem;
  onOpenOverlay: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("nav");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive
          type="button"
          tapScale={1}
          aria-label={t("NAV_FAVORITES_ROW_ACTIONS")}
          className={FAVORITES_ACTION_BUTTON_CLASSNAME}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </ButtonPrimitive>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuIconItem
          icon={<ArrowUpRight className="size-4" aria-hidden="true" />}
          onSelect={props.onOpenOverlay}
        >
          {t("NAV_FAVORITES_ACTION_OPEN_OVERLAY")}
        </DropdownMenuIconItem>
        <DropdownMenuIconItem
          icon={<ExternalLink className="size-4" aria-hidden="true" />}
          onSelect={() => window.open(buildHref(props.row.path), "_blank", "noopener,noreferrer")}
        >
          {t("NAV_FAVORITES_ACTION_OPEN_TAB")}
        </DropdownMenuIconItem>
        <DropdownMenuSeparator />
        <DropdownMenuIconItem
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          onSelect={props.onRemove}
        >
          {t("NAV_FAVORITES_ACTION_REMOVE")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FavoriteFolderMenu(props: { onRename: () => void; onDelete: () => void }) {
  const { t } = useTranslation("nav");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive
          type="button"
          tapScale={1}
          aria-label={t("NAV_FAVORITES_FOLDER_ACTIONS")}
          className={FAVORITES_ACTION_BUTTON_CLASSNAME}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </ButtonPrimitive>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuIconItem
          icon={<Pencil className="size-4" aria-hidden="true" />}
          onSelect={props.onRename}
        >
          {t("NAV_FAVORITES_ACTION_RENAME_FOLDER")}
        </DropdownMenuIconItem>
        <DropdownMenuIconItem
          icon={<Trash2 className="size-4" aria-hidden="true" />}
          onSelect={props.onDelete}
        >
          {t("NAV_FAVORITES_ACTION_DELETE_FOLDER")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FavoritesHeaderMenu(props: { onCreateFolder: () => void }) {
  const { t } = useTranslation("nav");

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive
          type="button"
          tapScale={1}
          aria-label={t("NAV_FAVORITES_SECTION_ACTIONS")}
          className={FAVORITES_ACTION_BUTTON_CLASSNAME}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </ButtonPrimitive>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuIconItem
          icon={<FolderPlus className="size-4" aria-hidden="true" />}
          onSelect={props.onCreateFolder}
        >
          {t("NAV_FAVORITES_ACTION_NEW_FOLDER")}
        </DropdownMenuIconItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditableFolderLabel(props: {
  folderId: string;
  label: string;
  editingFolderId: string | null;
  draftName: string;
  onDraftChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("nav");
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = props.editingFolderId === props.folderId;

  useEffect(() => {
    if (!isEditing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [isEditing]);

  if (!isEditing) {
    return <span className="min-w-0 flex-1 truncate">{props.label}</span>;
  }

  return (
    <input
      ref={inputRef}
      value={props.draftName}
      aria-label={t("NAV_FAVORITES_FOLDER_NAME_INPUT")}
      onChange={(event) => props.onDraftChange(event.target.value)}
      onBlur={props.onCommit}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onCommit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          props.onCancel();
        }
      }}
      className="min-w-0 flex-1 rounded-sm border border-border/70 bg-background px-2 py-1 text-callout text-label-primary outline-none"
    />
  );
}

function useLabelOverflow(text: string) {
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const element = labelRef.current;
    if (!element) return;

    const update = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth + 1);
    };

    update();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [text]);

  return { labelRef, isOverflowing };
}

function FavoriteLeafRow(props: {
  row: FavoriteDisplayItem;
  onSelect: () => void;
  onOpenOverlay: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.row.sortId,
  });
  const { labelRef, isOverflowing } = useLabelOverflow(props.row.label);

  const button = (
    <ButtonPrimitive
      type="button"
      tapScale={1}
      aria-label={props.row.label}
      data-active={props.row.isSelected ? "true" : "false"}
      className="flex min-w-0 flex-1 items-center justify-start text-left outline-none"
      onClick={props.onSelect}
      {...attributes}
      {...listeners}
    >
      <span ref={labelRef} className="min-w-0 flex-1 truncate">
        {props.row.label}
      </span>
    </ButtonPrimitive>
  );

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging ? "true" : "false"}
      className="group/favorite-row flex min-w-0 items-center select-none"
    >
      <div
        data-active={props.row.isSelected ? "true" : "false"}
        data-dragging={isDragging ? "true" : "false"}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 items-center gap-2",
          NAV_ITEM_HEIGHT_CLASSNAME,
          NAV_ITEM_RADIUS_CLASSNAME,
          NAV_ITEM_BUTTON_PADDING_CLASSNAME,
          INTERACTIVE_TRANSITION_CLASSNAME,
          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
          "bg-transparent focus-within:bg-transparent data-[active=true]:bg-transparent",
          "[&:not([data-highlight])]:hover:bg-transparent",
          "text-callout data-[dragging=true]:opacity-15",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild focusTrigger={false}>
            {button}
          </TooltipTrigger>
          <TooltipContent hidden={!isOverflowing} className="max-w-[28rem]">
            {props.row.label}
          </TooltipContent>
        </Tooltip>
        <div className={FAVORITES_ROW_ACTIONS_CLASSNAME}>
          <FavoriteItemMenu
            row={props.row}
            onOpenOverlay={props.onOpenOverlay}
            onRemove={props.onRemove}
          />
        </div>
      </div>
    </div>
  );
}

function FavoriteFolderRow(props: {
  row: FavoriteDisplayFolder;
  editingFolderId: string | null;
  draftName: string;
  onDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  isFolderDropTarget: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.row.sortId,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-dragging={isDragging ? "true" : "false"}
      className="group/favorite-row flex min-w-0 items-center select-none"
    >
      <div
        data-active={props.row.isSelected ? "true" : "false"}
        data-dragging={isDragging ? "true" : "false"}
        data-folder-drop-target={props.isFolderDropTarget ? "true" : "false"}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 items-center gap-2",
          NAV_ITEM_HEIGHT_CLASSNAME,
          NAV_ITEM_RADIUS_CLASSNAME,
          NAV_ITEM_BUTTON_PADDING_CLASSNAME,
          INTERACTIVE_TRANSITION_CLASSNAME,
          NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
          "bg-transparent focus-visible:bg-transparent data-[active=true]:bg-transparent",
          "[&:not([data-highlight])]:hover:bg-transparent",
          "text-callout data-[dragging=true]:opacity-15",
          "data-[folder-drop-target=true]:animate-pulse",
        )}
      >
        {props.isFolderDropTarget ? (
          <span className="pointer-events-none absolute inset-0 rounded-md border border-dashed border-primary/55" />
        ) : null}
        <ButtonPrimitive
          type="button"
          tapScale={1}
          data-active={props.row.isSelected ? "true" : "false"}
          className="relative flex min-w-0 flex-1 items-center text-left outline-none"
          onClick={props.onToggle}
          {...attributes}
          {...listeners}
        >
          <FolderDisclosureIcon
            open={props.row.expanded}
            className="pointer-events-none absolute -left-[2.125rem] top-1/2 size-5 -translate-y-1/2"
          />
          <EditableFolderLabel
            folderId={props.row.folderId}
            label={props.row.label}
            editingFolderId={props.editingFolderId}
            draftName={props.draftName}
            onDraftChange={props.onDraftChange}
            onCommit={props.onCommitRename}
            onCancel={props.onCancelRename}
          />
        </ButtonPrimitive>
        <div className={FAVORITES_ROW_ACTIONS_CLASSNAME}>
          <FavoriteFolderMenu onRename={props.onRename} onDelete={props.onDelete} />
        </div>
      </div>
    </div>
  );
}

function FavoriteDragOverlayRow(props: { node: FavoriteDragOverlayNode }) {
  return (
    <div
      className="pointer-events-none select-none"
      style={{ width: 220, willChange: "transform" }}
    >
      <div
        className={cn(
          "flex items-center gap-2 border border-border/70 bg-background/72 text-callout text-label-primary opacity-80 shadow-2xl backdrop-blur-md",
          NAV_ITEM_HEIGHT_CLASSNAME,
          NAV_ITEM_RADIUS_CLASSNAME,
          NAV_ITEM_BUTTON_PADDING_CLASSNAME,
        )}
      >
        {props.node.type === "folder" ? (
          <FolderDisclosureIcon open={Boolean(props.node.expanded)} className="size-5 shrink-0" />
        ) : (
          <span className="size-5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{props.node.label}</span>
      </div>
    </div>
  );
}

function FavoriteRootInsertionTarget(props: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: favoriteInsertionId(null, props.index),
  });

  return (
    <div className="relative h-0 overflow-visible">
      <div
        ref={setNodeRef}
        data-over={isOver ? "true" : "false"}
        className="pointer-events-auto absolute inset-x-0 -top-3 z-20 h-6"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-3 right-3 transition-all duration-150",
            isOver ? "opacity-100" : "opacity-0",
          )}
        >
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
            <div className="relative h-px rounded-full bg-primary/70 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
              <span className="absolute -left-0.5 top-1/2 size-2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_3px_rgba(59,130,246,0.16)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FavoriteNodeTree(props: {
  nodes: FavoriteDisplayNode[];
  editingFolderId: string | null;
  draftName: string;
  onDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onSelectItem: (item: FavoriteDisplayItem) => void;
  onOpenOverlay: (item: FavoriteDisplayItem) => void;
  onRemoveItem: (path: string) => void;
  onToggleFolder: (folderId: string, expanded: boolean) => void;
  onRenameFolder: (folder: FavoriteDisplayFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  dragging: boolean;
  dragContext: FavoriteDragContext | null;
}) {
  return (
    <div className={NAV_SUBTREE_GUIDE_CLASSNAME}>
      <div className={cn("flex flex-col", NAV_SUBTREE_CLASSNAME)}>
        <FavoriteSiblingList {...props} parentId={null} />
      </div>
    </div>
  );
}

function FavoriteSiblingList(
  props: React.ComponentProps<typeof FavoriteNodeTree> & {
    parentId: string | null;
  },
) {
  const { setNodeRef } = useDroppable({
    id: favoriteContainerId(props.parentId),
  });

  return (
    <SortableContext
      items={props.nodes.map((node) => node.sortId)}
      strategy={verticalListSortingStrategy}
    >
      <div ref={setNodeRef} className="flex min-h-2 flex-col gap-1">
        {props.parentId === null && props.dragging ? (
          <FavoriteRootInsertionTarget index={0} />
        ) : null}
        {props.nodes.map((node, index) => (
          <Fragment key={node.sortId}>
            {node.type === "item" ? (
              <FavoriteLeafRow
                row={node}
                onSelect={() => props.onSelectItem(node)}
                onOpenOverlay={() => props.onOpenOverlay(node)}
                onRemove={() => props.onRemoveItem(node.path)}
              />
            ) : (
              <div className="flex flex-col gap-1">
                <FavoriteFolderRow
                  row={node}
                  editingFolderId={props.editingFolderId}
                  draftName={props.draftName}
                  onDraftChange={props.onDraftChange}
                  onCommitRename={props.onCommitRename}
                  onCancelRename={props.onCancelRename}
                  onToggle={() => props.onToggleFolder(node.folderId, !node.expanded)}
                  onRename={() => props.onRenameFolder(node)}
                  onDelete={() => props.onDeleteFolder(node.folderId)}
                  isFolderDropTarget={props.dragContext?.folderDropTargetId === node.folderId}
                />
                {node.children.length > 0 ? (
                  <Collapsible open={node.expanded}>
                    <CollapsibleContent className={FAVORITES_COLLAPSIBLE_CONTENT_CLASSNAME}>
                      <div className={NAV_SUBTREE_GUIDE_CLASSNAME}>
                        <div className="flex flex-col">
                          <FavoriteSiblingList
                            {...props}
                            nodes={node.children}
                            parentId={node.folderId}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            )}
            {props.parentId === null && props.dragging ? (
              <FavoriteRootInsertionTarget index={index + 1} />
            ) : null}
          </Fragment>
        ))}
      </div>
    </SortableContext>
  );
}

function FavoritesPanelContent(props: {
  nodes: FavoriteDisplayNode[];
  onReorder: (parentId: string | null, orderedIds: string[]) => void;
  onMove: (nodeId: string, targetParentId: string | null, index?: number) => void;
  onSelectItem: (item: FavoriteDisplayItem) => void;
  onOpenOverlay: (item: FavoriteDisplayItem) => void;
  onRemoveItem: (path: string) => void;
  onToggleFolder: (folderId: string, expanded: boolean) => void;
  onRenameFolder: (folder: FavoriteDisplayFolder) => void;
  onDeleteFolder: (folderId: string) => void;
  editingFolderId: string | null;
  draftName: string;
  onDraftChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const dndMaps = useMemo(() => buildDndMaps(props.nodes), [props.nodes]);
  const [draggingNode, setDraggingNode] = useState<FavoriteDragOverlayNode | null>(null);
  const [dragContext, setDragContext] = useState<FavoriteDragContext | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    const node = findDisplayNodeBySortId(props.nodes, activeId);
    if (!node) {
      setDraggingNode(null);
      setDragContext(null);
      return;
    }

    setDraggingNode({
      id: node.sortId,
      type: node.type,
      label: node.label,
      expanded: node.type === "folder" ? node.expanded : undefined,
    });
    setDragContext({
      activeId,
      activeType: node.type,
      sourceParentId: dndMaps.parentById.get(activeId) ?? null,
      folderDropTargetId: null,
    });
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    setDragContext((current) => {
      if (!current) return current;
      const overId = over ? String(over.id) : null;
      const overNode = overId ? findDisplayNodeBySortId(props.nodes, overId) : null;
      const folderDropTargetId =
        current.activeType === "item" &&
        overNode?.type === "folder" &&
        current.sourceParentId !== overNode.folderId &&
        current.activeId !== overNode.sortId
          ? overNode.folderId
          : null;

      if (current.folderDropTargetId === folderDropTargetId) return current;
      return {
        ...current,
        folderDropTargetId,
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingNode(null);
    setDragContext(null);
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;

    const insertionTarget = parseInsertionId(overId);
    const activeNode = findDisplayNodeBySortId(props.nodes, activeId);
    const overNode = findDisplayNodeBySortId(props.nodes, overId);
    const sourceParentId = dndMaps.parentById.get(activeId) ?? null;
    const targetContainerParentId = parentIdFromContainerId(overId);

    if (insertionTarget) {
      props.onMove(activeId, insertionTarget.parentId, insertionTarget.index);
      return;
    }

    if (targetContainerParentId !== null || overId === favoriteContainerId(null)) {
      props.onMove(activeId, targetContainerParentId);
      return;
    }

    if (
      activeNode?.type === "item" &&
      overNode?.type === "folder" &&
      sourceParentId !== overNode.folderId
    ) {
      props.onMove(activeId, overNode.folderId);
      props.onToggleFolder(overNode.folderId, true);
      return;
    }

    const targetParentId = dndMaps.parentById.get(overId) ?? null;

    if (sourceParentId === targetParentId) {
      const siblingIds = dndMaps.siblingIdsByParent.get(sourceParentId) ?? [];
      const oldIndex = siblingIds.indexOf(activeId);
      const newIndex = siblingIds.indexOf(overId);
      if (oldIndex < 0 || newIndex < 0) return;
      props.onReorder(sourceParentId, arrayMove(siblingIds, oldIndex, newIndex));
      return;
    }

    const siblingIds = dndMaps.siblingIdsByParent.get(targetParentId) ?? [];
    const targetIndex = siblingIds.indexOf(overId);
    props.onMove(activeId, targetParentId, targetIndex < 0 ? undefined : targetIndex);
  };

  if (props.nodes.length === 0) return <EmptyFavoritesCard />;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragCancel={() => {
        setDraggingNode(null);
        setDragContext(null);
      }}
      onDragEnd={handleDragEnd}
    >
      <FavoriteNodeTree {...props} dragging={Boolean(draggingNode)} dragContext={dragContext} />
      <DragOverlay modifiers={[snapOverlayCenterToPointer]}>
        {draggingNode ? <FavoriteDragOverlayRow node={draggingNode} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

export function FavoritesNode(props: FavoritesNodeProps) {
  const { t } = useTranslation("nav");
  const navigate = useNavigate();
  const sessionVersion = useAuthStore((state) => state.sessionVersion);
  const favoriteTree = useFavoritesStore((state) => state.items);
  const sectionExpanded = useFavoritesStore((state) => state.sectionExpanded);
  const setSectionExpanded = useFavoritesStore((state) => state.setSectionExpanded);
  const removeFavorite = useFavoritesStore((state) => state.remove);
  const reorderFavorites = useFavoritesStore((state) => state.reorder);
  const moveFavorite = useFavoritesStore((state) => state.move);
  const addFolder = useFavoritesStore((state) => state.addFolder);
  const renameFolder = useFavoritesStore((state) => state.renameFolder);
  const deleteFolder = useFavoritesStore((state) => state.deleteFolder);
  const setFolderExpanded = useFavoritesStore((state) => state.setFolderExpanded);

  const [collapsedOpen, setCollapsedOpen] = useState(false);
  const [overlayEntry, setOverlayEntry] = useState<FavoriteOverlayEntry | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const overlayWorkspaceBase = useMemo(
    () => (overlayEntry ? extractWorkspaceBaseFromPath(overlayEntry.href) : null),
    [overlayEntry],
  );
  const overlayWorkspaceId = useMemo(
    () => overlayWorkspaceBase?.replace("/w/", "") ?? null,
    [overlayWorkspaceBase],
  );

  const folderStateMap = useMemo(() => buildFolderStateMap(favoriteTree), [favoriteTree]);
  const nodes = useMemo(
    () =>
      buildDisplayNodes(
        props.item.children ?? [],
        props.activeKeys,
        props.suppressedKeys,
        folderStateMap,
      ),
    [folderStateMap, props.activeKeys, props.item.children, props.suppressedKeys],
  );
  const effectiveExpanded = sectionExpanded;
  const overlayWorkspaceDetailQuery = useQuery({
    queryKey: ["workspace", "detail", overlayWorkspaceId, sessionVersion, "favorite-overlay"],
    enabled: Boolean(overlayWorkspaceId && overlayEntry),
    queryFn: async () => getWorkspaceDetail(String(overlayWorkspaceId)),
    staleTime: 5 * 60 * 1000,
    retry: false,
    meta: { silent: true },
  });
  const overlayBreadcrumbSegments = useMemo(
    () =>
      overlayEntry
        ? buildFavoriteOverlayBreadcrumbSegments(
            overlayEntry.href,
            overlayEntry.label,
            t,
            overlayWorkspaceDetailQuery.data,
          )
        : [],
    [overlayEntry, overlayWorkspaceDetailQuery.data, t],
  );

  const defaultFolderName = t("NAV_FAVORITES_NEW_FOLDER_NAME");

  const startEditingFolder = (folderId: string, label: string) => {
    setEditingFolderId(folderId);
    setDraftName(label);
  };

  const commitFolderRename = () => {
    if (!editingFolderId) return;
    const fallbackName = folderStateMap.get(editingFolderId)?.name ?? defaultFolderName;
    renameFolder(editingFolderId, draftName.trim() || fallbackName);
    setEditingFolderId(null);
    setDraftName("");
  };

  const cancelFolderRename = () => {
    setEditingFolderId(null);
    setDraftName("");
  };

  const handleCreateFolder = () => {
    setSectionExpanded(true);
    const folderId = addFolder(defaultFolderName, null);
    startEditingFolder(folderId, defaultFolderName);
  };

  const handleSelectItem = (row: FavoriteDisplayItem) => {
    props.onSelectPath(row.path);
    if (!row.path) return;
    if (!props.allowSamePathNavigate && row.path === props.pathname) return;
    void navigate({ to: row.path as never });
    setCollapsedOpen(false);
  };

  const headerButtonClassName = cn(
    "relative z-10",
    NAV_ITEM_HEIGHT_CLASSNAME,
    NAV_ITEM_BUTTON_PADDING_CLASSNAME,
    NAV_ITEM_RADIUS_CLASSNAME,
    INTERACTIVE_TRANSITION_CLASSNAME,
    NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
    NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
    NAV_ITEM_COLLAPSED_BUTTON_CLASSNAME,
    "group-data-[collapsible=icon]:gap-0",
    props.item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
  );

  const headerButton = (
    <SidebarMenuButton
      isActive={props.isTrailActive}
      tooltip={props.label}
      className={headerButtonClassName}
      onClick={() => {
        if (props.isCollapsed) {
          setCollapsedOpen((open) => !open);
          return;
        }
        setSectionExpanded(!sectionExpanded);
      }}
    >
      {iconSlot(0, props.item.icon, { isActive: props.isTrailActive, collapseMotion: "shift" })}
      <span className={cn("min-w-0 flex-1 truncate", NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}>
        {props.label}
      </span>
    </SidebarMenuButton>
  );

  const chevronIndicator = (
    <ChevronRight
      size={16}
      className={cn(
        "shrink-0 text-label-secondary transition-transform duration-200",
        effectiveExpanded && "rotate-90",
      )}
      aria-hidden="true"
    />
  );

  const collapsedChevronButton = (
    <ButtonPrimitive
      type="button"
      tapScale={1}
      aria-label={
        effectiveExpanded ? t("NAV_FAVORITES_ACTION_COLLAPSE") : t("NAV_FAVORITES_ACTION_EXPAND")
      }
      className={FAVORITES_ACTION_BUTTON_CLASSNAME}
      onClick={() => setSectionExpanded(!effectiveExpanded)}
    >
      <ChevronRight
        className={cn("size-4 transition-transform duration-200", effectiveExpanded && "rotate-90")}
        aria-hidden="true"
      />
    </ButtonPrimitive>
  );

  const panelContent = (
    <FavoritesPanelContent
      nodes={nodes}
      onReorder={reorderFavorites}
      onMove={moveFavorite}
      onSelectItem={handleSelectItem}
      onOpenOverlay={(item) =>
        setOverlayEntry({
          label: item.label,
          href: buildHref(item.path),
          embedHref: buildFavoriteOverlayEmbedHref(item.path),
        })
      }
      onRemoveItem={removeFavorite}
      onToggleFolder={setFolderExpanded}
      onRenameFolder={(folder) => startEditingFolder(folder.folderId, folder.label)}
      onDeleteFolder={deleteFolder}
      editingFolderId={editingFolderId}
      draftName={draftName}
      onDraftChange={setDraftName}
      onCommitRename={commitFolderRename}
      onCancelRename={cancelFolderRename}
    />
  );

  return (
    <>
      <SidebarMenuItem className="group/nav-item">
        {props.isCollapsed ? (
          <Popover open={collapsedOpen} onOpenChange={setCollapsedOpen}>
            <PopoverAnchor className="block w-full">{headerButton}</PopoverAnchor>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              className="w-88 p-2"
              onOpenAutoFocus={(event) => event.preventDefault()}
              onCloseAutoFocus={(event) => event.preventDefault()}
              onMouseDownCapture={(event) => event.stopPropagation()}
              onPointerDownCapture={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-1 px-1 pb-2">
                <div className="min-w-0 flex-1 text-callout font-semibold text-label-primary">
                  {props.label}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {effectiveExpanded ? (
                    <FavoritesHeaderMenu onCreateFolder={handleCreateFolder} />
                  ) : null}
                  {collapsedChevronButton}
                </div>
              </div>
              {panelContent}
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex flex-col gap-1">
            <div
              data-active={props.isTrailActive ? "true" : "false"}
              className={cn(
                "relative z-10 flex items-center gap-1",
                NAV_ITEM_HEIGHT_CLASSNAME,
                NAV_ITEM_RADIUS_CLASSNAME,
                NAV_ITEM_BUTTON_PADDING_CLASSNAME,
                INTERACTIVE_TRANSITION_CLASSNAME,
                NAV_ITEM_INTERACTIVE_TEXT_CLASSNAME,
                NAV_ITEM_INTERACTIVE_BG_CLASSNAME,
                props.item.disabled ? DISABLED_ITEM_CLASSNAME : "hover:cursor-pointer",
              )}
            >
              <ButtonPrimitive
                type="button"
                tapScale={1}
                data-active={props.isTrailActive ? "true" : "false"}
                className="flex min-w-0 flex-1 items-center gap-2 text-left outline-none"
                onClick={() => setSectionExpanded(!sectionExpanded)}
              >
                {iconSlot(0, props.item.icon, {
                  isActive: props.isTrailActive,
                  collapseMotion: "shift",
                })}
                <span className="min-w-0 flex-1 truncate">{props.label}</span>
              </ButtonPrimitive>
              <div className={FAVORITES_TRAILING_CONTROLS_CLASSNAME}>
                {effectiveExpanded ? (
                  <FavoritesHeaderMenu onCreateFolder={handleCreateFolder} />
                ) : null}
                <span
                  className={cn(NAV_TRAILING_ICON_SLOT_CLASSNAME, NAV_ITEM_COLLAPSE_HIDE_CLASSNAME)}
                >
                  {chevronIndicator}
                </span>
              </div>
            </div>
            <Collapsible open={effectiveExpanded}>
              <CollapsibleContent className={FAVORITES_COLLAPSIBLE_CONTENT_CLASSNAME}>
                {panelContent}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </SidebarMenuItem>

      <ExpandableScreen
        expanded={Boolean(overlayEntry)}
        onExpandChange={(expanded) => {
          if (!expanded) setOverlayEntry(null);
        }}
        layoutId="sidebar-favorite-overlay"
      >
        <ExpandableScreenContent
          showCloseButton={false}
          className="border border-border/80 bg-background shadow-2xl"
        >
          {overlayEntry ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center gap-4 border-b border-border/70 px-6 py-4 sm:px-8 sm:py-5">
                <div className="min-w-0 flex-1">
                  <Breadcrumb>
                    <BreadcrumbList className="m-0 mb-0! flex-nowrap overflow-hidden whitespace-nowrap p-0 text-callout">
                      {overlayBreadcrumbSegments.map((segment, index) => {
                        const isLast = index === overlayBreadcrumbSegments.length - 1;
                        const Icon = segment.icon;
                        return (
                          <Fragment key={segment.key}>
                            {index > 0 ? <BreadcrumbSeparator /> : null}
                            <BreadcrumbItem className="min-w-0">
                              {isLast ? (
                                <BreadcrumbPage className="flex min-w-0 items-center gap-2 truncate font-semibold">
                                  {segment.kind === "workspace" ? (
                                    <WorkspaceAvatar
                                      name={segment.label}
                                      size={18}
                                      className="rounded-[4px]"
                                      {...workspaceAvatarPropsFromIdentity(
                                        segment.workspaceIdentity,
                                      )}
                                    />
                                  ) : Icon ? (
                                    <Icon
                                      className="size-4 shrink-0 overflow-visible"
                                      strokeWidth={1.9}
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span className="truncate">{segment.label}</span>
                                </BreadcrumbPage>
                              ) : (
                                <span className="flex min-w-0 items-center gap-2 truncate text-label-secondary">
                                  {segment.kind === "workspace" ? (
                                    <WorkspaceAvatar
                                      name={segment.label}
                                      size={18}
                                      className="rounded-[4px]"
                                      {...workspaceAvatarPropsFromIdentity(
                                        segment.workspaceIdentity,
                                      )}
                                    />
                                  ) : Icon ? (
                                    <Icon
                                      className="size-4 shrink-0 overflow-visible"
                                      strokeWidth={1.9}
                                      aria-hidden="true"
                                    />
                                  ) : null}
                                  <span className="truncate">{segment.label}</span>
                                </span>
                              )}
                            </BreadcrumbItem>
                          </Fragment>
                        );
                      })}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild focusTrigger={false}>
                      <ButtonPrimitive
                        type="button"
                        tapScale={1}
                        aria-label={t("NAV_FAVORITES_ACTION_OPEN_TAB")}
                        className={FAVORITE_OVERLAY_ICON_BUTTON_CLASSNAME}
                        onClick={() =>
                          window.open(overlayEntry.href, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink className="size-4" aria-hidden="true" />
                      </ButtonPrimitive>
                    </TooltipTrigger>
                    <TooltipContent>{t("NAV_FAVORITES_ACTION_OPEN_TAB")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild focusTrigger={false}>
                      <ButtonPrimitive
                        type="button"
                        tapScale={1}
                        aria-label={t("NAV_FAVORITES_ACTION_OPEN_THIS_TAB")}
                        className={FAVORITE_OVERLAY_ICON_BUTTON_CLASSNAME}
                        onClick={() => {
                          setOverlayEntry(null);
                          if (normalizePath(overlayEntry.href) === normalizePath(props.pathname)) {
                            return;
                          }
                          void navigate({ to: overlayEntry.href as never });
                        }}
                      >
                        <ArrowUpRight className="size-4" aria-hidden="true" />
                      </ButtonPrimitive>
                    </TooltipTrigger>
                    <TooltipContent>{t("NAV_FAVORITES_ACTION_OPEN_THIS_TAB")}</TooltipContent>
                  </Tooltip>
                  <div className="mx-1 h-4 w-px bg-border/70" aria-hidden="true" />
                  <Tooltip>
                    <TooltipTrigger asChild focusTrigger={false}>
                      <ButtonPrimitive
                        type="button"
                        tapScale={1}
                        aria-label={t("NAV_FAVORITES_ACTION_CLOSE_OVERLAY")}
                        className={FAVORITE_OVERLAY_ICON_BUTTON_CLASSNAME}
                        onClick={() => setOverlayEntry(null)}
                      >
                        <X className="size-4" aria-hidden="true" />
                      </ButtonPrimitive>
                    </TooltipTrigger>
                    <TooltipContent>{t("NAV_FAVORITES_ACTION_CLOSE_OVERLAY")}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="min-h-0 flex-1 bg-background">
                <iframe
                  title={overlayEntry.label}
                  src={overlayEntry.embedHref}
                  className="h-full w-full bg-background"
                />
              </div>
            </div>
          ) : null}
        </ExpandableScreenContent>
      </ExpandableScreen>
    </>
  );
}
