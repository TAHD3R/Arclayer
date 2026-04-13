import * as React from "react";

import {
  ActivityIcon,
  CopyIcon,
  EllipsisIcon,
  FileDownIcon,
  FilePlus2Icon,
  FileUpIcon,
  HistoryIcon,
  Link2Icon,
  Maximize2,
  PanelRightClose,
  SearchIcon,
  Settings2Icon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import { useClientPlatform } from "@arclayer/hooks/use-client-platform";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { Input } from "@arclayer/ui/input";
import { Kbd, KbdGroup } from "@arclayer/ui/kbd";

import { ContentLibraryArticleEditorExportDialog } from "./content-library-article-editor-export-dialog";
import { ContentLibraryArticleEditorImportDialog } from "./content-library-article-editor-import-dialog";
import { ContentLibraryArticleEditorSearchOverlay } from "./content-library-article-editor-search-dialog";
import { serializeArticleEditorToMarkdown } from "../lib/content-library-article-editor-io";

function slugifyFilename(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "article";
  return trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
}

function resolveShortcutKeyLabel(
  key: string,
  platform: ReturnType<typeof useClientPlatform>,
): string {
  if (key === "mod") {
    return platform === "mac" ? "⌘" : "Ctrl";
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

function DocumentMenuShortcut(props: {
  keys: readonly string[];
  platform: ReturnType<typeof useClientPlatform>;
}) {
  return (
    <DropdownMenuShortcut>
      <KbdGroup className="gap-1">
        {props.keys.map((key) => (
          <Kbd
            key={key}
            className="h-5 min-w-5 rounded-[6px] border border-border/50 bg-card/70 px-2 text-caption! font-semibold text-label-secondary"
          >
            {resolveShortcutKeyLabel(key, props.platform)}
          </Kbd>
        ))}
      </KbdGroup>
    </DropdownMenuShortcut>
  );
}

function DocumentMenuActionItem(props: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  shortcut?: React.ReactNode;
}) {
  return (
    <DropdownMenuItem onSelect={props.onSelect}>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span aria-hidden="true" className="flex min-w-4 shrink-0 items-center justify-center">
          {props.icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{props.label}</span>
      </span>
      {props.shortcut}
    </DropdownMenuItem>
  );
}

function normalizeMenuSearchValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function ContentLibraryArticleEditorMenuBar(props: {
  className?: string;
  itemTitle: string;
  mode: "page" | "split";
  onDelete?: () => void | Promise<void>;
  onDuplicate?: () => void | Promise<void>;
  onImportDocument: (value: Record<string, unknown>) => void;
  onOpenAllUpdates?: () => void;
  onOpenPageEditor?: () => void;
  onOpenSeo?: () => void;
  onOpenVersionHistory?: () => void;
  onCloseSplit?: () => void;
  onVisibilityChange: (value: "public" | "private") => void;
  slug: string;
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  onSlugChange: (value: string) => void;
}) {
  const { t } = useTranslation(["content", "common"]);
  const platform = useClientPlatform();
  const editor = useEditorRef();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [menuSearchQuery, setMenuSearchQuery] = React.useState("");
  const menuSearchInputRef = React.useRef<HTMLInputElement | null>(null);
  const statusKey = `CONTENT_LIBRARY_STATUS_${props.status.toUpperCase()}`;
  const exportFilename = React.useMemo(
    () => slugifyFilename(props.slug || props.itemTitle),
    [props.itemTitle, props.slug],
  );

  const handleCopyMarkdown = React.useCallback(async () => {
    try {
      const markdown = serializeArticleEditorToMarkdown(editor);
      await copyToClipboard(markdown);
      notifySuccessText(t("CONTENT_LIBRARY_EDITOR_COPY_PAGE_CONTENT_SUCCESS"));
      setMenuOpen(false);
    } catch (error) {
      notifyError(error);
    }
  }, [editor, t]);

  React.useEffect(() => {
    if (!menuOpen) {
      setMenuSearchQuery("");
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      menuSearchInputRef.current?.focus();
      menuSearchInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [menuOpen]);

  const matchesMenuQuery = React.useCallback(
    (label: string) => {
      const normalizedQuery = normalizeMenuSearchValue(menuSearchQuery);
      if (!normalizedQuery) return true;
      return normalizeMenuSearchValue(label).includes(normalizedQuery);
    },
    [menuSearchQuery],
  );

  const searchMenuLabel = t("CONTENT_LIBRARY_EDITOR_MENU_SEARCH");
  const undoMenuLabel = t("CONTENT_LIBRARY_EDITOR_ACTION_UNDO");
  const copyPageContentLabel = t("CONTENT_LIBRARY_EDITOR_MENU_COPY_PAGE_CONTENT");
  const importMenuLabel = t("CONTENT_LIBRARY_EDITOR_MENU_IMPORT");
  const exportMenuLabel = t("CONTENT_LIBRARY_EDITOR_MENU_EXPORT");
  const duplicatePageLabel = t("CONTENT_LIBRARY_EDITOR_MENU_DUPLICATE_PAGE");
  const deleteMenuLabel = t("CONTENT_LIBRARY_ACTION_DELETE");
  const versionHistoryLabel = t("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY");
  const allUpdatesLabel = t("CONTENT_LIBRARY_EDITOR_MENU_ALL_UPDATES");
  const settingsMenuLabel = t("CONTENT_LIBRARY_EDITOR_MENU_SETTINGS");
  const seoMenuLabel = t("CONTENT_LIBRARY_EDITOR_MENU_SEO");
  const closeSidebarPreviewLabel = t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW");
  const openPageEditorLabel = t("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR");

  const showSearchAction = matchesMenuQuery(searchMenuLabel);
  const showUndoAction = matchesMenuQuery(undoMenuLabel);
  const showCopyAction = matchesMenuQuery(copyPageContentLabel);
  const showImportAction = matchesMenuQuery(importMenuLabel);
  const showExportAction = matchesMenuQuery(exportMenuLabel);
  const showDuplicateAction = matchesMenuQuery(duplicatePageLabel);
  const showDeleteAction = matchesMenuQuery(deleteMenuLabel);
  const showVersionHistoryAction =
    Boolean(props.onOpenVersionHistory) && matchesMenuQuery(versionHistoryLabel);
  const showAllUpdatesAction = Boolean(props.onOpenAllUpdates) && matchesMenuQuery(allUpdatesLabel);
  const showSettingsAction = matchesMenuQuery(settingsMenuLabel) || matchesMenuQuery(seoMenuLabel);
  const showCloseSplitAction =
    props.mode === "split" &&
    Boolean(props.onCloseSplit) &&
    matchesMenuQuery(closeSidebarPreviewLabel);
  const showOpenPageEditorAction =
    props.mode === "split" &&
    Boolean(props.onOpenPageEditor) &&
    matchesMenuQuery(openPageEditorLabel);

  const showEditGroup = showSearchAction || showUndoAction;
  const showClipboardGroup = showCopyAction || showImportAction || showExportAction;
  const showDangerGroup = showDuplicateAction || showDeleteAction;
  const showHistoryGroup = showVersionHistoryAction || showAllUpdatesAction;
  const showSplitGroup = showCloseSplitAction || showOpenPageEditorAction;
  const hasVisibleItems =
    showEditGroup ||
    showClipboardGroup ||
    showDangerGroup ||
    showHistoryGroup ||
    showSettingsAction ||
    showSplitGroup;

  return (
    <div className="relative shrink-0">
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}
            className={props.className}
          >
            <EllipsisIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[19rem]">
          <div className="px-1 pb-2">
            <Input
              ref={menuSearchInputRef}
              value={menuSearchQuery}
              aria-label={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU_SEARCH_PLACEHOLDER")}
              placeholder={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU_SEARCH_PLACEHOLDER")}
              className="h-8 border-border/70 bg-background/80 text-callout"
              onChange={(event) => setMenuSearchQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>

          {showEditGroup ? (
            <>
              {showSearchAction ? (
                <DocumentMenuActionItem
                  icon={<SearchIcon className="size-4" />}
                  label={searchMenuLabel}
                  onSelect={() => {
                    setSearchOpen(true);
                    setMenuOpen(false);
                  }}
                  shortcut={<DocumentMenuShortcut keys={["mod", "f"]} platform={platform} />}
                />
              ) : null}
              {showUndoAction ? (
                <DocumentMenuActionItem
                  icon={<Undo2Icon className="size-4" />}
                  label={undoMenuLabel}
                  onSelect={() => {
                    editor.undo();
                    setMenuOpen(false);
                  }}
                  shortcut={<DocumentMenuShortcut keys={["mod", "z"]} platform={platform} />}
                />
              ) : null}
            </>
          ) : null}

          {showEditGroup &&
          (showClipboardGroup ||
            showDangerGroup ||
            showHistoryGroup ||
            showSettingsAction ||
            showSplitGroup) ? (
            <DropdownMenuSeparator />
          ) : null}

          {showClipboardGroup ? (
            <>
              {showCopyAction ? (
                <DropdownMenuIconItem
                  icon={<CopyIcon className="size-4" />}
                  onSelect={() => {
                    void handleCopyMarkdown();
                  }}
                >
                  {copyPageContentLabel}
                </DropdownMenuIconItem>
              ) : null}
              {showImportAction ? (
                <DropdownMenuIconItem
                  icon={<FileUpIcon className="size-4" />}
                  onSelect={() => {
                    setImportOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  {importMenuLabel}
                </DropdownMenuIconItem>
              ) : null}
              {showExportAction ? (
                <DropdownMenuIconItem
                  icon={<FileDownIcon className="size-4" />}
                  onSelect={() => {
                    setExportOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  {exportMenuLabel}
                </DropdownMenuIconItem>
              ) : null}
            </>
          ) : null}

          {showClipboardGroup &&
          (showDangerGroup || showHistoryGroup || showSettingsAction || showSplitGroup) ? (
            <DropdownMenuSeparator />
          ) : null}

          {showDangerGroup ? (
            <>
              {showDuplicateAction ? (
                <DropdownMenuIconItem
                  icon={<FilePlus2Icon className="size-4" />}
                  disabled={!props.onDuplicate}
                  onSelect={() => {
                    props.onDuplicate?.();
                    setMenuOpen(false);
                  }}
                >
                  {duplicatePageLabel}
                </DropdownMenuIconItem>
              ) : null}
              {showDeleteAction ? (
                <DropdownMenuIconItem
                  icon={<Trash2Icon className="size-4" />}
                  variant="destructive"
                  disabled={!props.onDelete}
                  onSelect={() => {
                    props.onDelete?.();
                    setMenuOpen(false);
                  }}
                >
                  {deleteMenuLabel}
                </DropdownMenuIconItem>
              ) : null}
            </>
          ) : null}

          {showDangerGroup && (showHistoryGroup || showSettingsAction || showSplitGroup) ? (
            <DropdownMenuSeparator />
          ) : null}

          {showHistoryGroup ? (
            <>
              {showVersionHistoryAction ? (
                <DropdownMenuIconItem
                  icon={<HistoryIcon className="size-4" />}
                  onSelect={() => {
                    props.onOpenVersionHistory?.();
                    setMenuOpen(false);
                  }}
                >
                  {versionHistoryLabel}
                </DropdownMenuIconItem>
              ) : null}
              {showAllUpdatesAction ? (
                <DropdownMenuIconItem
                  icon={<ActivityIcon className="size-4" />}
                  onSelect={() => {
                    props.onOpenAllUpdates?.();
                    setMenuOpen(false);
                  }}
                >
                  {allUpdatesLabel}
                </DropdownMenuIconItem>
              ) : null}
            </>
          ) : null}

          {showHistoryGroup && (showSettingsAction || showSplitGroup) ? (
            <DropdownMenuSeparator />
          ) : null}

          {showSettingsAction ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Settings2Icon className="size-4" />
                {settingsMenuLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-[18rem]">
                <DropdownMenuLabel>{t(statusKey)}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{t("CONTENT_LIBRARY_EDITOR_MENU_VISIBILITY")}</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={props.visibility}
                  onValueChange={(value) => props.onVisibilityChange(value as "public" | "private")}
                >
                  <DropdownMenuRadioItem value="public">
                    {t("CONTENT_LIBRARY_VISIBILITY_PUBLIC")}
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="private">
                    {t("CONTENT_LIBRARY_VISIBILITY_PRIVATE")}
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <div className="space-y-1 px-2 py-1.5">
                  <div className="text-caption text-label-secondary">
                    {t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}
                  </div>
                  <Input
                    aria-label={t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}
                    value={props.slug}
                    onChange={(event) => props.onSlugChange(event.target.value)}
                    className="h-8"
                    onKeyDown={(event) => event.stopPropagation()}
                  />
                </div>
                {props.onOpenSeo ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        props.onOpenSeo?.();
                        setMenuOpen(false);
                      }}
                    >
                      <Link2Icon className="size-4" />
                      {seoMenuLabel}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          {showSettingsAction && showSplitGroup ? <DropdownMenuSeparator /> : null}

          {showSplitGroup ? (
            <>
              {showCloseSplitAction ? (
                <DropdownMenuIconItem
                  icon={<PanelRightClose className="size-4" />}
                  onSelect={() => {
                    props.onCloseSplit?.();
                    setMenuOpen(false);
                  }}
                >
                  {closeSidebarPreviewLabel}
                </DropdownMenuIconItem>
              ) : null}
              {showOpenPageEditorAction ? (
                <DropdownMenuIconItem
                  icon={<Maximize2 className="size-4" />}
                  onSelect={() => {
                    props.onOpenPageEditor?.();
                    setMenuOpen(false);
                  }}
                >
                  {openPageEditorLabel}
                </DropdownMenuIconItem>
              ) : null}
            </>
          ) : null}

          {!hasVisibleItems ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("common:FILTER_NO_RESULTS_FOUND")}</DropdownMenuLabel>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ContentLibraryArticleEditorSearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
      <ContentLibraryArticleEditorImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImportDocument={props.onImportDocument}
      />
      <ContentLibraryArticleEditorExportDialog
        defaultFilename={exportFilename}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </div>
  );
}
