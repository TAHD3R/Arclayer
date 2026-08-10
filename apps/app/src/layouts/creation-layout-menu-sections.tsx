import {
  Check,
  Clipboard,
  Copy,
  Eye,
  FilePlus2,
  Focus,
  FolderOpen,
  History,
  MoreHorizontal,
  PanelTop,
  PenTool,
  Redo2,
  Scissors,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
  ChevronRight,
} from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState, type FocusEventHandler, type MouseEventHandler } from "react";

import { cn } from "@arclayer/lib/utils";
import { FloatingPanelButton } from "@arclayer/ui/floating-panel";
import { Popover, PopoverAnchor, PopoverContent } from "@arclayer/ui/popover";

export type EditorMenuCopy = {
  search: string;
  noResults: string;
  dashboard: string;
  file: string;
  edit: string;
  view: string;
  preferences: string;
  notifications: string;
  helpAccount: string;
  newProject: string;
  versionHistory: string;
  saved: string;
  duplicateProject: string;
  deleteProject: string;
  share: string;
  undo: string;
  redo: string;
  askAi: string;
  duplicate: string;
  delete: string;
  copy: string;
  cut: string;
  paste: string;
  comments: string;
  sitemap: string;
  wireframe: string;
  styleGuide: string;
  design: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  zoom200: string;
  zoom100: string;
  zoom50: string;
};

export function buildEditorMenuCopy(t: TFunction): EditorMenuCopy {
  return {
    search: t("CREATION_EDITOR_MENU_SEARCH"),
    noResults: t("CREATION_EDITOR_MENU_NO_RESULTS"),
    dashboard: t("CREATION_EDITOR_MENU_DASHBOARD"),
    file: t("CREATION_EDITOR_MENU_FILE"),
    edit: t("CREATION_EDITOR_MENU_EDIT"),
    view: t("CREATION_EDITOR_MENU_VIEW"),
    preferences: t("CREATION_EDITOR_MENU_PREFERENCES"),
    notifications: t("CREATION_EDITOR_MENU_NOTIFICATIONS"),
    helpAccount: t("CREATION_EDITOR_MENU_HELP_ACCOUNT"),
    newProject: t("CREATION_EDITOR_MENU_NEW_PROJECT"),
    versionHistory: t("CREATION_EDITOR_MENU_VERSION_HISTORY"),
    saved: t("CREATION_EDITOR_MENU_SAVED"),
    duplicateProject: t("CREATION_EDITOR_MENU_DUPLICATE_PROJECT"),
    deleteProject: t("CREATION_EDITOR_MENU_DELETE_PROJECT"),
    share: t("CREATION_EDITOR_MENU_SHARE"),
    undo: t("CREATION_EDITOR_UNDO"),
    redo: t("CREATION_EDITOR_REDO"),
    askAi: t("CREATION_EDITOR_MENU_ASK_AI"),
    duplicate: t("CREATION_EDITOR_MENU_DUPLICATE"),
    delete: t("CREATION_EDITOR_MENU_DELETE"),
    copy: t("CREATION_EDITOR_MENU_COPY"),
    cut: t("CREATION_EDITOR_MENU_CUT"),
    paste: t("CREATION_EDITOR_MENU_PASTE"),
    comments: t("CREATION_EDITOR_MENU_COMMENTS"),
    sitemap: t("CREATION_EDITOR_STAGE_SITEMAP"),
    wireframe: t("CREATION_EDITOR_STAGE_WIREFRAME"),
    styleGuide: t("CREATION_EDITOR_STAGE_STYLE_GUIDE"),
    design: t("CREATION_EDITOR_STAGE_DESIGN"),
    zoomIn: t("CREATION_EDITOR_ZOOM_IN"),
    zoomOut: t("CREATION_EDITOR_ZOOM_OUT"),
    zoomFit: t("CREATION_EDITOR_FIT_CANVAS"),
    zoom200: "200%",
    zoom100: "100%",
    zoom50: "50%",
  };
}

const MENU_ITEM_CLASSNAME = cn(
  "group rounded-none px-4 transition-[background-color,color] duration-200",
  "hover:bg-accent hover:text-label-primary",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
);

export function EditorMenuItem(props: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  onMouseEnter?: MouseEventHandler<HTMLButtonElement>;
  onMouseLeave?: MouseEventHandler<HTMLButtonElement>;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}) {
  return (
    <FloatingPanelButton
      className={cn(MENU_ITEM_CLASSNAME, props.disabled && "pointer-events-none opacity-50")}
      onClick={props.disabled ? undefined : props.onSelect}
      onMouseEnter={props.onMouseEnter}
      onMouseLeave={props.onMouseLeave}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      aria-disabled={props.disabled || undefined}
    >
      <span className="flex min-w-0 flex-1 items-center gap-3">
        {props.icon ? (
          <span className="flex size-4 shrink-0 items-center justify-center">{props.icon}</span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-callout">{props.label}</span>
      </span>
      {props.shortcut ? (
        <span className="ml-auto shrink-0 text-caption text-label-secondary">{props.shortcut}</span>
      ) : null}
      {props.trailing ? <span className="shrink-0 opacity-70">{props.trailing}</span> : null}
    </FloatingPanelButton>
  );
}

export function MenuDivider() {
  return <div className="mx-4 my-2 h-px bg-border/60" />;
}

export function matchesSearch(query: string, ...labels: string[]) {
  const normalized = query.trim().toLocaleLowerCase();
  return !normalized || labels.some((label) => label.toLocaleLowerCase().includes(normalized));
}

function EditorSubmenu(props: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  const closeTimeoutRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(
    () => () => {
      if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
    },
    [],
  );

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current !== null) window.clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = null;
  };
  const openSubmenu = () => {
    clearCloseTimeout();
    setOpen(true);
  };
  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => setOpen(false), 120);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor className="block w-full">
        <EditorMenuItem
          icon={props.icon}
          label={props.label}
          trailing={<ChevronRight className="size-4" aria-hidden="true" />}
          onSelect={openSubmenu}
          onMouseEnter={openSubmenu}
          onMouseLeave={scheduleClose}
          onFocus={openSubmenu}
          onBlur={scheduleClose}
        />
      </PopoverAnchor>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        className="w-64 p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseEnter={clearCloseTimeout}
        onMouseLeave={scheduleClose}
        onMouseDownCapture={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => event.stopPropagation()}
      >
        <div className="py-1">{props.children}</div>
      </PopoverContent>
    </Popover>
  );
}

export function EditorFileMenu(props: { copy: EditorMenuCopy; onNewProject: () => void }) {
  const { copy } = props;
  return (
    <EditorSubmenu icon={<FolderOpen className="size-4" />} label={copy.file}>
      <EditorMenuItem
        icon={<FilePlus2 className="size-4" />}
        label={copy.newProject}
        onSelect={props.onNewProject}
      />
      <EditorMenuItem icon={<History className="size-4" />} label={copy.versionHistory} disabled />
      <EditorMenuItem icon={<Check className="size-4" />} label={copy.saved} disabled />
      <EditorMenuItem icon={<Copy className="size-4" />} label={copy.duplicateProject} disabled />
      <EditorMenuItem icon={<Trash2 className="size-4" />} label={copy.deleteProject} disabled />
    </EditorSubmenu>
  );
}

export function EditorEditMenu({ copy }: { copy: EditorMenuCopy }) {
  return (
    <EditorSubmenu icon={<PenTool className="size-4" />} label={copy.edit}>
      <EditorMenuItem
        icon={<Undo2 className="size-4" />}
        label={copy.undo}
        shortcut="⌘Z"
        disabled
      />
      <EditorMenuItem
        icon={<Redo2 className="size-4" />}
        label={copy.redo}
        shortcut="⌘⇧Z"
        disabled
      />
      <MenuDivider />
      <EditorMenuItem icon={<Sparkles className="size-4" />} label={copy.askAi} disabled />
      <MenuDivider />
      <EditorMenuItem
        icon={<Copy className="size-4" />}
        label={copy.duplicate}
        shortcut="⌘D"
        disabled
      />
      <EditorMenuItem icon={<Trash2 className="size-4" />} label={copy.delete} disabled />
      <EditorMenuItem icon={<Copy className="size-4" />} label={copy.copy} shortcut="⌘C" disabled />
      <EditorMenuItem
        icon={<Scissors className="size-4" />}
        label={copy.cut}
        shortcut="⌘X"
        disabled
      />
      <EditorMenuItem
        icon={<Clipboard className="size-4" />}
        label={copy.paste}
        shortcut="⌘V"
        disabled
      />
    </EditorSubmenu>
  );
}

export function EditorViewMenu({ copy }: { copy: EditorMenuCopy }) {
  return (
    <EditorSubmenu icon={<Eye className="size-4" />} label={copy.view}>
      <EditorMenuItem
        icon={undefined}
        label={copy.comments}
        trailing={<Check className="size-4" aria-hidden="true" />}
      />
      <EditorMenuItem
        icon={undefined}
        label={copy.sitemap}
        trailing={<Check className="size-4" aria-hidden="true" />}
      />
      <EditorMenuItem icon={<PanelTop className="size-4" />} label={copy.wireframe} disabled />
      <EditorMenuItem
        icon={<MoreHorizontal className="size-4" />}
        label={copy.styleGuide}
        disabled
      />
      <EditorMenuItem icon={<Settings2 className="size-4" />} label={copy.design} disabled />
      <MenuDivider />
      <EditorMenuItem
        icon={<ZoomIn className="size-4" />}
        label={copy.zoomIn}
        shortcut="⌘+"
        disabled
      />
      <EditorMenuItem
        icon={<ZoomOut className="size-4" />}
        label={copy.zoomOut}
        shortcut="⌘−"
        disabled
      />
      <EditorMenuItem
        icon={<Focus className="size-4" />}
        label={copy.zoomFit}
        shortcut="⇧1"
        disabled
      />
      <MenuDivider />
      <EditorMenuItem icon={undefined} label={copy.zoom200} />
      <EditorMenuItem
        icon={undefined}
        label={copy.zoom100}
        shortcut="⌘0"
        trailing={<Check className="size-4" aria-hidden="true" />}
      />
      <EditorMenuItem icon={undefined} label={copy.zoom50} />
    </EditorSubmenu>
  );
}
