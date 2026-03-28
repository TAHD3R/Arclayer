"use client";

import * as React from "react";

import {
  ChevronLeft,
  ChevronRight,
  Code2,
  ListIcon,
  ListOrderedIcon,
  MoreHorizontal,
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

import {
  applyArticleEditorInsertItem,
  getArticleEditorInsertGroups,
  type ArticleEditorInsertItem,
} from "@/components/editor/article-editor-insert-items";
import { AlignToolbarButton } from "@/components/editor/align-toolbar-button";
import { useArticleEditorCommands } from "@/components/editor/article-editor-command-context";
import { FontSizeToolbarButton } from "@/components/editor/font-size-toolbar-button";
import { FontColorToolbarButton } from "@/components/editor/font-color-toolbar-button";
import { InlineEquationToolbarButton } from "@/components/editor/equation-toolbar-button";
import { LineHeightToolbarButton } from "@/components/editor/line-height-toolbar-button";
import { LinkToolbarButton } from "@/components/editor/link-toolbar-button";
import { MoreToolbarButton } from "@/components/editor/more-toolbar-button";
import { TableToolbarButton } from "@/components/editor/table-toolbar-button";
import { TurnIntoToolbarButton } from "@/components/editor/turn-into-toolbar-button";
import { getBlockType } from "@/components/editor/transforms";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@/components/ui/toolbar";
import { Button } from "@arclayer/ui/button";
import {
  DropdownMenu as ActionDropdownMenu,
  DropdownMenuTrigger as ActionDropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import {
  FloatingPanelButton,
  FloatingPanelContent,
  FloatingPanelRoot,
  FloatingPanelTrigger,
  useFloatingPanel,
} from "@arclayer/ui/floating-panel";
import { cn } from "@arclayer/lib/utils";

import { ContentLibraryArticleEditorMenu } from "./content-library-article-editor-menu";
import { ContentLibraryArticleEditorSaveIndicator } from "./content-library-article-editor-save-indicator";

function UndoToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (currentEditor) => currentEditor.history.undos.length === 0,
    [],
  );

  return (
    <ToolbarButton
      disabled={disabled}
      onClick={() => editor.undo()}
      onMouseDown={(event) => event.preventDefault()}
      tooltip={t("CONTENT_LIBRARY_EDITOR_ACTION_UNDO")}
    >
      <Undo2Icon />
    </ToolbarButton>
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
    <ToolbarButton
      disabled={disabled}
      onClick={() => editor.redo()}
      onMouseDown={(event) => event.preventDefault()}
      tooltip={t("CONTENT_LIBRARY_EDITOR_ACTION_REDO")}
    >
      <Redo2Icon />
    </ToolbarButton>
  );
}

function InsertItemMenuEntry(props: { item: ArticleEditorInsertItem }) {
  const editor = useEditorRef();
  const commands = useArticleEditorCommands();
  const { closeFloatingPanel } = useFloatingPanel();
  const Icon = props.item.icon;

  return (
    <FloatingPanelButton
      className="items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/70"
      onClick={() => {
        if (commands?.insertItem) {
          commands.insertItem(editor, props.item.value);
        } else {
          applyArticleEditorInsertItem(editor, props.item.value);
        }
        editor.tf.focus();
        closeFloatingPanel();
      }}
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-label-secondary">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{props.item.label}</span>
        <span className="mt-0.5 block text-left text-footnote text-label-secondary">
          {props.item.description}
        </span>
      </span>
    </FloatingPanelButton>
  );
}

function ArticleEditorInsertToolbarButton() {
  const { t } = useTranslation("content");
  const groups = getArticleEditorInsertGroups(t);

  return (
    <FloatingPanelRoot>
      <FloatingPanelTrigger
        title={t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}
        aria-label={t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}
        className="h-8 min-w-8 rounded-md border-0 bg-transparent px-2 shadow-none hover:bg-muted"
      >
        <span className="flex items-center justify-center">
          <PlusIcon />
        </span>
      </FloatingPanelTrigger>
      <FloatingPanelContent
        placement="bottom"
        offset={10}
        showTitle={false}
        className="ignore-click-outside/toolbar max-h-[30rem] min-w-[17rem] overflow-y-auto p-2"
      >
        {groups.map((group, index) => (
          <div key={group.id} className={cn("border-border/70", index > 0 && "mt-2 border-t pt-2")}>
            <div className="px-3 pb-1 text-caption font-medium text-label-secondary">
              {group.label}
            </div>
            {group.items.map((item) => (
              <InsertItemMenuEntry key={item.value} item={item} />
            ))}
          </div>
        ))}
      </FloatingPanelContent>
    </FloatingPanelRoot>
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
    <ToolbarButton
      pressed={pressed}
      tooltip={props.tooltip}
      onClick={() => {
        toggleList(editor, { listStyleType: props.listType });
        editor.tf.focus();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {props.icon}
    </ToolbarButton>
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
    <ToolbarButton
      pressed={blockType === KEYS.toggle}
      tooltip={t("CONTENT_LIBRARY_EDITOR_INSERT_TOGGLE")}
      onClick={() => {
        applyArticleEditorInsertItem(editor, KEYS.toggle);
        editor.tf.focus();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <ToggleRight />
    </ToolbarButton>
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
      ) : null}
    </div>
  );
}

export function ContentLibraryArticleEditorPageToolbar(props: {
  hasPublishableVersion?: boolean;
  isPublishing?: boolean;
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
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/70 bg-background px-3">
      <ToolbarScroller>
        <Toolbar className="min-w-max flex-nowrap gap-0.5 pr-2">
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
              <span className="font-medium">A</span>
            </FontColorToolbarButton>
            <FontColorToolbarButton
              nodeType={KEYS.backgroundColor}
              tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR")}
            >
              <span className="rounded bg-warning/20 px-1 font-medium">A</span>
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
        <ActionDropdownMenu>
          <ActionDropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </ActionDropdownMenuTrigger>
          <ContentLibraryArticleEditorMenu
            status={props.status}
            visibility={props.visibility}
            onVisibilityChange={props.onVisibilityChange}
            slug={props.slug}
            onSlugChange={props.onSlugChange}
          />
        </ActionDropdownMenu>
      </div>
    </div>
  );
}
