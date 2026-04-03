"use client";

import * as React from "react";

import {
  AudioLinesIcon,
  BaselineIcon,
  ChevronLeft,
  ChevronRight,
  Code2,
  FileUpIcon,
  FilmIcon,
  FolderOpen,
  ImageIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  PaintBucketIcon,
  PlusIcon,
  Redo2Icon,
  SquareIcon,
  StrikethroughIcon,
  ToggleRight,
  Undo2Icon,
  UnderlineIcon,
  Upload,
} from "lucide-react";
import { toggleList } from "@platejs/list";
import { KEYS, type TElement } from "platejs";
import { useEditorRef, useEditorSelector, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu as ActionDropdownMenu,
  DropdownMenuContent as ActionDropdownMenuContent,
  DropdownMenuItem as ActionDropdownMenuItem,
  DropdownMenuTrigger as ActionDropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  AlignToolbarButton,
  applyArticleEditorInsertItem,
  ArticleEditorInsertMenuContent,
  FontColorToolbarButton,
  FontSizeToolbarButton,
  getArticleEditorInsertGroups,
  getBlockType,
  InlineEquationToolbarButton,
  insertTodoList,
  LineHeightToolbarButton,
  LinkToolbarButton,
  MarkToolbarButton,
  MoreToolbarButton,
  TableToolbarButton,
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSplitButton,
  ToolbarSplitButtonPrimary,
  ToolbarSplitButtonSecondary,
  ToolbarTooltip,
  TurnIntoToolbarButton,
  useArticleEditorCommands,
} from "@arclayer/ui/editor";
import { cn } from "@arclayer/lib/utils";

import { ContentLibraryArticleEditorMenuBar } from "./content-library-article-editor-menu";
import { ContentLibraryArticleEditorSaveIndicator } from "./content-library-article-editor-save-indicator";

function UndoToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (currentEditor) => currentEditor.history.undos.length === 0,
    [],
  );

  return (
    <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_ACTION_UNDO")}>
      <ToolbarButton
        disabled={disabled}
        onClick={() => editor.undo()}
        onMouseDown={(event) => event.preventDefault()}
        tooltip={undefined}
      >
        <Undo2Icon />
      </ToolbarButton>
    </ToolbarTooltip>
  );
}

function RedoToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (currentEditor) => currentEditor.history.redos.length === 0,
    [],
  );

  return (
    <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_ACTION_REDO")}>
      <ToolbarButton
        disabled={disabled}
        onClick={() => editor.redo()}
        onMouseDown={(event) => event.preventDefault()}
        tooltip={undefined}
      >
        <Redo2Icon />
      </ToolbarButton>
    </ToolbarTooltip>
  );
}

function ArticleEditorInsertToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const commands = useArticleEditorCommands();
  const groups = getArticleEditorInsertGroups(t);
  const [open, setOpen] = React.useState(false);

  const handleInsert = React.useCallback(
    (value: string) => {
      if (commands?.insertItem) {
        commands.insertItem(editor, value);
      } else {
        applyArticleEditorInsertItem(editor, value);
      }
      editor.tf.focus();
      setOpen(false);
    },
    [commands, editor],
  );

  return (
    <ActionDropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}>
        <ActionDropdownMenuTrigger asChild>
          <ToolbarButton
            pressed={open}
            isDropdown
            dropdownMode="icon"
            aria-label={t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}
            onMouseDown={(event) => event.preventDefault()}
          >
            <PlusIcon />
          </ToolbarButton>
        </ActionDropdownMenuTrigger>
      </ToolbarTooltip>
      <ArticleEditorInsertMenuContent
        groups={groups}
        onSelectItem={handleInsert}
        align="start"
        className="ignore-click-outside/toolbar"
      />
    </ActionDropdownMenu>
  );
}

function MediaInsertToolbarButton(props: {
  icon: React.ReactNode;
  kind: "image" | "video" | "audio" | "file";
  tooltip: string;
}) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const commands = useArticleEditorCommands();

  if (!commands?.openMediaInsert) return null;

  return (
    <ActionDropdownMenu modal={false}>
      <ToolbarTooltip tooltip={props.tooltip}>
        <ToolbarSplitButton>
          <ToolbarSplitButtonPrimary
            aria-label={props.tooltip}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              commands.openMediaInsert?.(editor, { kind: props.kind, source: "upload" })
            }
          >
            {props.icon}
          </ToolbarSplitButtonPrimary>
          <ActionDropdownMenuTrigger asChild>
            <ToolbarSplitButtonSecondary
              aria-label={props.tooltip}
              onMouseDown={(event) => event.preventDefault()}
            />
          </ActionDropdownMenuTrigger>
        </ToolbarSplitButton>
      </ToolbarTooltip>
      <ActionDropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-[15rem]"
      >
        <ActionDropdownMenuItem
          onSelect={() =>
            commands.openMediaInsert?.(editor, { kind: props.kind, source: "upload" })
          }
        >
          <Upload className="size-4" />
          {t("CONTENT_LIBRARY_EDITOR_UPLOAD_FROM_COMPUTER")}
        </ActionDropdownMenuItem>
        <ActionDropdownMenuItem
          onSelect={() =>
            commands.openMediaInsert?.(editor, { kind: props.kind, source: "library" })
          }
        >
          <FolderOpen className="size-4" />
          {t("CONTENT_LIBRARY_EDITOR_SELECT_FROM_LIBRARY")}
        </ActionDropdownMenuItem>
        <ActionDropdownMenuItem
          onSelect={() => commands.openMediaInsert?.(editor, { kind: props.kind, source: "url" })}
        >
          <Link2Icon className="size-4" />
          {t("CONTENT_LIBRARY_EDITOR_INSERT_VIA_URL")}
        </ActionDropdownMenuItem>
      </ActionDropdownMenuContent>
    </ActionDropdownMenu>
  );
}

function InsertCodeBlockToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();

  return (
    <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK")}>
      <ToolbarButton
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          applyArticleEditorInsertItem(editor, KEYS.codeBlock);
          editor.tf.focus();
        }}
      >
        <Code2 />
      </ToolbarButton>
    </ToolbarTooltip>
  );
}

function ListToolbarButton(props: { icon: React.ReactNode; listType: string; tooltip: string }) {
  const editor = useEditorRef();
  const pressed = useEditorSelector(
    (currentEditor) =>
      !!currentEditor.selection &&
      currentEditor.api.some({ at: currentEditor.selection, match: { type: props.listType } }),
    [props.listType],
  );

  return (
    <ToolbarTooltip tooltip={props.tooltip}>
      <ToolbarButton
        pressed={pressed}
        tooltip={undefined}
        onClick={() => {
          if (props.listType === KEYS.listTodo) {
            insertTodoList(editor, false);
          } else {
            toggleList(editor, { listStyleType: props.listType });
          }
          editor.tf.focus();
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        {props.icon}
      </ToolbarButton>
    </ToolbarTooltip>
  );
}

function ToggleBlockToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const blockType = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });

  return (
    <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_TOGGLE")}>
      <ToolbarButton
        pressed={blockType === KEYS.toggle}
        tooltip={undefined}
        onClick={() => {
          applyArticleEditorInsertItem(editor, KEYS.toggle);
          editor.tf.focus();
        }}
        onMouseDown={(event) => event.preventDefault()}
      >
        <ToggleRight />
      </ToolbarButton>
    </ToolbarTooltip>
  );
}

function ToolbarScroller(props: { children: React.ReactNode }) {
  const { t } = useTranslation("content");
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    setCanScrollLeft(node.scrollLeft > 8);
    setCanScrollRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 8);
  }, []);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    updateScrollState();
    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(node);
    if (node.parentElement) {
      resizeObserver.observe(node.parentElement);
    }

    node.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    return () => {
      resizeObserver.disconnect();
      node.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  const scrollByAmount = React.useCallback((direction: "left" | "right") => {
    const node = containerRef.current;
    if (!node) return;
    node.scrollBy({
      left: direction === "left" ? -240 : 240,
      behavior: "smooth",
    });
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {canScrollLeft ? (
        <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_TOOLBAR_SCROLL_LEFT")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={t("CONTENT_LIBRARY_EDITOR_TOOLBAR_SCROLL_LEFT")}
            onClick={() => scrollByAmount("left")}
          >
            <ChevronLeft className="size-4" />
          </Button>
        </ToolbarTooltip>
      ) : null}

      <div className="relative min-w-0 flex-1">
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent transition-opacity",
            canScrollLeft ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent transition-opacity",
            canScrollRight ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={containerRef}
          className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {props.children}
        </div>
      </div>

      {canScrollRight ? (
        <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_TOOLBAR_SCROLL_RIGHT")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={t("CONTENT_LIBRARY_EDITOR_TOOLBAR_SCROLL_RIGHT")}
            onClick={() => scrollByAmount("right")}
          >
            <ChevronRight className="size-4" />
          </Button>
        </ToolbarTooltip>
      ) : null}
    </div>
  );
}

export function ContentLibraryArticleEditorPageToolbar(props: {
  hasPublishableVersion?: boolean;
  itemTitle: string;
  isPublishing?: boolean;
  onDelete?: () => void | Promise<void>;
  onDuplicate?: () => void | Promise<void>;
  onImportDocument: (value: Record<string, unknown>) => void;
  onOpenAllUpdates?: () => void;
  onOpenSeo?: () => void;
  onOpenVersionHistory?: () => void;
  onPublish?: () => void;
  onVisibilityChange: (value: "public" | "private") => void;
  saveError?: unknown;
  saveState?: "hidden" | "saving" | "saved" | "error";
  slug: string;
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  onSlugChange: (value: string) => void;
}) {
  const { t } = useTranslation("content");

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-card px-4 md:px-5">
      <ContentLibraryArticleEditorMenuBar
        itemTitle={props.itemTitle}
        mode="page"
        onDelete={props.onDelete}
        onDuplicate={props.onDuplicate}
        onImportDocument={props.onImportDocument}
        onOpenAllUpdates={props.onOpenAllUpdates}
        status={props.status}
        visibility={props.visibility}
        onOpenVersionHistory={props.onOpenVersionHistory}
        onVisibilityChange={props.onVisibilityChange}
        slug={props.slug}
        onSlugChange={props.onSlugChange}
        onOpenSeo={props.onOpenSeo}
      />

      <ToolbarScroller>
        <Toolbar className="min-w-max flex-nowrap gap-0.5 pr-3">
          <ToolbarGroup>
            <UndoToolbarButton />
            <RedoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <ArticleEditorInsertToolbarButton />
            <TurnIntoToolbarButton />
            <FontSizeToolbarButton tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_FONT_SIZE")} />
          </ToolbarGroup>

          <ToolbarGroup>
            <MediaInsertToolbarButton
              kind="image"
              icon={<ImageIcon />}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE")}
            />
            <MediaInsertToolbarButton
              kind="video"
              icon={<FilmIcon />}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_VIDEO")}
            />
            <MediaInsertToolbarButton
              kind="audio"
              icon={<AudioLinesIcon />}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_AUDIO")}
            />
            <MediaInsertToolbarButton
              kind="file"
              icon={<FileUpIcon />}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_FILE")}
            />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}>
              <strong>B</strong>
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType={KEYS.italic}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}
            >
              <span className="italic">I</span>
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_UNDERLINE")}
            >
              <UnderlineIcon />
            </MarkToolbarButton>
            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_STRIKETHROUGH")}
            >
              <StrikethroughIcon />
            </MarkToolbarButton>
            <MarkToolbarButton nodeType={KEYS.code} tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_CODE")}>
              <Code2 />
            </MarkToolbarButton>
            <InlineEquationToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <FontColorToolbarButton
              nodeType={KEYS.color}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR")}
            >
              <BaselineIcon />
            </FontColorToolbarButton>
            <FontColorToolbarButton
              nodeType={KEYS.backgroundColor}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR")}
            >
              <PaintBucketIcon />
            </FontColorToolbarButton>
            <LinkToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <ListToolbarButton
              listType={KEYS.ul}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_BULLETED_LIST")}
              icon={<ListIcon />}
            />
            <ListToolbarButton
              listType={KEYS.ol}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_NUMBERED_LIST")}
              icon={<ListOrderedIcon />}
            />
            <ListToolbarButton
              listType={KEYS.listTodo}
              tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_TODO_LIST")}
              icon={<SquareIcon />}
            />
            <ToggleBlockToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <AlignToolbarButton />
            <LineHeightToolbarButton />
            <InsertCodeBlockToolbarButton />
            <TableToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MoreToolbarButton />
          </ToolbarGroup>
        </Toolbar>
      </ToolbarScroller>

      <div className="flex shrink-0 items-center gap-2 border-l border-border/60 pl-3">
        <ContentLibraryArticleEditorSaveIndicator
          state={props.saveState ?? "hidden"}
          isPublishing={props.isPublishing}
          error={props.saveError}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={
            !props.hasPublishableVersion || props.isPublishing || props.saveState === "saving"
          }
          onClick={props.onPublish}
        >
          <Upload className="size-4" />
          {t("CONTENT_LIBRARY_ACTION_PUBLISH")}
        </Button>
      </div>
    </div>
  );
}
