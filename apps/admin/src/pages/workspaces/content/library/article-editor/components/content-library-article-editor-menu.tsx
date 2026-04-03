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
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "@/lib/clipboard";
import { notifyError, notifySuccessText } from "@/lib/notifications";
import { cn } from "@arclayer/lib/utils";
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

import { ContentLibraryArticleEditorExportDialog } from "./content-library-article-editor-export-dialog";
import { ContentLibraryArticleEditorImportDialog } from "./content-library-article-editor-import-dialog";
import { ContentLibraryArticleEditorSearchDialog } from "./content-library-article-editor-search-dialog";
import { serializeArticleEditorToMarkdown } from "../lib/content-library-article-editor-io";

function slugifyFilename(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "article";
  return trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
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
  const editor = useEditorRef();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const statusKey = `CONTENT_LIBRARY_STATUS_${props.status.toUpperCase()}`;
  const exportFilename = React.useMemo(
    () => slugifyFilename(props.slug || props.itemTitle),
    [props.itemTitle, props.slug],
  );

  const handleCopyMarkdown = React.useCallback(async () => {
    try {
      const markdown = serializeArticleEditorToMarkdown(editor);
      await copyToClipboard(markdown);
      notifySuccessText(t("CONTENT_LIBRARY_EDITOR_COPY_MARKDOWN_SUCCESS"));
      setMenuOpen(false);
    } catch (error) {
      notifyError(error);
    }
  }, [editor, t]);

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}
            className={cn("text-label-secondary hover:text-label-primary", props.className)}
          >
            <EllipsisIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[19rem]">
          <DropdownMenuLabel>{t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}</DropdownMenuLabel>
          <DropdownMenuIconItem
            icon={<SearchIcon className="size-4" />}
            onSelect={() => {
              setSearchOpen(true);
              setMenuOpen(false);
            }}
          >
            {t("CONTENT_LIBRARY_EDITOR_MENU_SEARCH")}
            <DropdownMenuShortcut>Mod+F</DropdownMenuShortcut>
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Undo2Icon className="size-4" />}
            onSelect={() => {
              editor.undo();
              setMenuOpen(false);
            }}
          >
            {t("CONTENT_LIBRARY_EDITOR_ACTION_UNDO")}
            <DropdownMenuShortcut>Mod+Z</DropdownMenuShortcut>
          </DropdownMenuIconItem>

          <DropdownMenuSeparator />

          <DropdownMenuIconItem
            icon={<CopyIcon className="size-4" />}
            onSelect={() => {
              void handleCopyMarkdown();
            }}
          >
            {t("CONTENT_LIBRARY_EDITOR_MENU_COPY_MARKDOWN")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<FileUpIcon className="size-4" />}
            onSelect={() => {
              setImportOpen(true);
              setMenuOpen(false);
            }}
          >
            {t("CONTENT_LIBRARY_EDITOR_MENU_IMPORT")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<FileDownIcon className="size-4" />}
            onSelect={() => {
              setExportOpen(true);
              setMenuOpen(false);
            }}
          >
            {t("CONTENT_LIBRARY_EDITOR_MENU_EXPORT")}
          </DropdownMenuIconItem>

          <DropdownMenuSeparator />

          <DropdownMenuIconItem
            icon={<FilePlus2Icon className="size-4" />}
            disabled={!props.onDuplicate}
            onSelect={() => {
              props.onDuplicate?.();
              setMenuOpen(false);
            }}
          >
            {t("CONTENT_LIBRARY_ACTION_DUPLICATE")}
          </DropdownMenuIconItem>
          <DropdownMenuIconItem
            icon={<Trash2Icon className="size-4" />}
            variant="destructive"
            disabled={!props.onDelete}
            onSelect={() => {
              props.onDelete?.();
              setMenuOpen(false);
            }}
          >
            {t("CONTENT_LIBRARY_ACTION_DELETE")}
          </DropdownMenuIconItem>

          <DropdownMenuSeparator />

          {props.onOpenVersionHistory ? (
            <DropdownMenuIconItem
              icon={<HistoryIcon className="size-4" />}
              onSelect={() => {
                props.onOpenVersionHistory?.();
                setMenuOpen(false);
              }}
            >
              {t("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY")}
            </DropdownMenuIconItem>
          ) : null}
          {props.onOpenAllUpdates ? (
            <DropdownMenuIconItem
              icon={<ActivityIcon className="size-4" />}
              onSelect={() => {
                props.onOpenAllUpdates?.();
                setMenuOpen(false);
              }}
            >
              {t("CONTENT_LIBRARY_EDITOR_MENU_ALL_UPDATES")}
            </DropdownMenuIconItem>
          ) : null}

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings2Icon className="size-4" />
              {t("CONTENT_LIBRARY_EDITOR_MENU_SETTINGS")}
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
                    {t("CONTENT_LIBRARY_EDITOR_MENU_SEO")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {props.mode === "split" && (props.onCloseSplit || props.onOpenPageEditor) ? (
            <>
              <DropdownMenuSeparator />
              {props.onCloseSplit ? (
                <DropdownMenuIconItem
                  icon={<PanelRightClose className="size-4" />}
                  onSelect={() => {
                    props.onCloseSplit?.();
                    setMenuOpen(false);
                  }}
                >
                  {t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")}
                </DropdownMenuIconItem>
              ) : null}
              {props.onOpenPageEditor ? (
                <DropdownMenuIconItem
                  icon={<Maximize2 className="size-4" />}
                  onSelect={() => {
                    props.onOpenPageEditor?.();
                    setMenuOpen(false);
                  }}
                >
                  {t("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")}
                </DropdownMenuIconItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ContentLibraryArticleEditorSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
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
    </>
  );
}
