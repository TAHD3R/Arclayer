import * as React from "react";

import {
  BaselineIcon,
  Code2,
  FileUpIcon,
  FilmIcon,
  FolderOpen,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ItalicIcon,
  Link2Icon,
  Maximize2,
  PaintBucketIcon,
  PanelRightClose,
  PilcrowIcon,
  QuoteIcon,
  SquareDashedBottomCodeIcon,
  ToggleRight,
  UnderlineIcon,
} from "lucide-react";
import { toggleList } from "@platejs/list";
import { openNextToggles } from "@platejs/toggle/react";
import { KEYS, type TElement } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Input } from "@arclayer/ui/input";
import {
  Menubar,
  MenubarContent,
  MenubarIconItem,
  MenubarItem,
  MenubarLabel,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@arclayer/ui/menubar";
import {
  applyArticleEditorInsertItem,
  applyEditorMarkColor,
  applyTurnInto,
  ARTICLE_EDITOR_INSERT_IMAGE,
  ARTICLE_EDITOR_INSERT_VIDEO,
  ARTICLE_EDITOR_INSERT_AUDIO,
  ARTICLE_EDITOR_INSERT_FILE,
  ARTICLE_EDITOR_INSERT_TOC,
  captureEditorSelection,
  clearEditorMarkColor,
  getEditorColorOptions,
  getTurnIntoValue,
  runEditorTransformPreservingSelection,
  setBlockType,
  toggleTodoList,
  TURN_INTO_MENU_ITEMS,
  useArticleEditorCommands,
} from "@arclayer/ui/editor";
import { cn } from "@arclayer/lib/utils";

const MENUBAR_SHORTCUTS: Partial<Record<string, string>> = {
  [KEYS.bold]: "Mod+B",
  [KEYS.italic]: "Mod+I",
  [KEYS.underline]: "Mod+U",
  [KEYS.code]: "Mod+E",
  [KEYS.h1]: "Mod+Alt+1",
  [KEYS.h2]: "Mod+Alt+2",
  [KEYS.h3]: "Mod+Alt+3",
  [KEYS.blockquote]: "Mod+Shift+.",
  [KEYS.toggle]: "Mod+Alt+T",
  [KEYS.codeBlock]: "Mod+Alt+7",
};

const MENUBAR_INSERT_ITEMS = [
  { icon: PilcrowIcon, value: KEYS.p },
  { icon: Heading1Icon, value: KEYS.h1 },
  { icon: Heading2Icon, value: KEYS.h2 },
  { icon: Heading3Icon, value: KEYS.h3 },
  { icon: QuoteIcon, value: KEYS.blockquote },
  { icon: ToggleRight, value: KEYS.toggle },
  { icon: Code2, value: KEYS.codeBlock },
  { icon: SquareDashedBottomCodeIcon, value: KEYS.hr },
  { icon: ImageIcon, value: ARTICLE_EDITOR_INSERT_IMAGE },
  { icon: FilmIcon, value: ARTICLE_EDITOR_INSERT_VIDEO },
  { icon: FileUpIcon, value: ARTICLE_EDITOR_INSERT_FILE },
  { icon: FolderOpen, value: ARTICLE_EDITOR_INSERT_TOC },
] as const;

function MenuSection(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 px-1 py-1">
      <div className="text-caption font-medium text-label-secondary">{props.label}</div>
      {props.children}
    </div>
  );
}

function MenuValue(props: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-footnote text-label-primary">
      {props.children}
    </div>
  );
}

function MenuItemWithShortcut(props: {
  icon: React.ReactNode;
  label: string;
  onSelect: () => void;
  shortcut?: string;
}) {
  return (
    <MenubarIconItem icon={props.icon} onSelect={props.onSelect}>
      {props.label}
      {props.shortcut ? <MenubarShortcut>{props.shortcut}</MenubarShortcut> : null}
    </MenubarIconItem>
  );
}

export function ContentLibraryArticleEditorMenuBar(props: {
  mode: "page" | "split";
  status: "draft" | "published" | "archived";
  visibility: "public" | "private";
  onVisibilityChange: (value: "public" | "private") => void;
  slug: string;
  onSlugChange: (value: string) => void;
  onCloseSplit?: () => void;
  onOpenPageEditor?: () => void;
  onOpenSeo?: () => void;
  className?: string;
}) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const commands = useArticleEditorCommands();
  const currentTurnIntoValue = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getTurnIntoValue(node as TElement),
  });
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const statusKey = `CONTENT_LIBRARY_STATUS_${props.status.toUpperCase()}`;

  const withSelection = React.useCallback(
    (action: () => void) => {
      selectionRef.current = captureEditorSelection(editor);
      runEditorTransformPreservingSelection(
        editor,
        () => {
          action();
        },
        { selection: selectionRef.current },
      );
    },
    [editor],
  );

  const handleInsert = React.useCallback(
    (value: string) => {
      if (
        value === ARTICLE_EDITOR_INSERT_IMAGE ||
        value === ARTICLE_EDITOR_INSERT_VIDEO ||
        value === ARTICLE_EDITOR_INSERT_AUDIO ||
        value === ARTICLE_EDITOR_INSERT_FILE
      ) {
        const kind =
          value === ARTICLE_EDITOR_INSERT_IMAGE
            ? "image"
            : value === ARTICLE_EDITOR_INSERT_VIDEO
              ? "video"
              : value === ARTICLE_EDITOR_INSERT_AUDIO
                ? "audio"
                : "file";
        commands?.openMediaInsert?.(editor, { kind, source: "upload" });
        return;
      }

      if (commands?.insertItem) {
        commands.insertItem(editor, value);
        return;
      }

      applyArticleEditorInsertItem(editor, value);
    },
    [commands, editor],
  );

  const handleToggleMark = React.useCallback(
    (nodeType: string, remove?: string | string[]) => {
      withSelection(() => {
        editor.tf.toggleMark(nodeType, remove ? { remove } : undefined);
      });
    },
    [editor, withSelection],
  );

  const applyMenuColor = React.useCallback(
    (nodeType: string, color: string | null) => {
      selectionRef.current = captureEditorSelection(editor);
      if (color === null) {
        clearEditorMarkColor(editor, nodeType, { selection: selectionRef.current });
        return;
      }

      applyEditorMarkColor(editor, nodeType, color, { selection: selectionRef.current });
    },
    [editor],
  );

  return (
    <Menubar className={cn("h-8 border-none bg-transparent p-0", props.className)}>
      <MenubarMenu>
        <MenubarTrigger>{t("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")}</MenubarTrigger>
        <MenubarContent className="w-[18rem] p-2">
          <MenuSection label={t("CONTENT_LIBRARY_EDITOR_MENU_STATUS")}>
            <MenuValue>{t(statusKey)}</MenuValue>
          </MenuSection>

          <MenuSection label={t("CONTENT_LIBRARY_EDITOR_MENU_VISIBILITY")}>
            <MenubarRadioGroup
              value={props.visibility}
              onValueChange={(nextValue) =>
                props.onVisibilityChange(nextValue as "public" | "private")
              }
            >
              <MenubarRadioItem value="public">
                {t("CONTENT_LIBRARY_VISIBILITY_PUBLIC")}
              </MenubarRadioItem>
              <MenubarRadioItem value="private">
                {t("CONTENT_LIBRARY_VISIBILITY_PRIVATE")}
              </MenubarRadioItem>
            </MenubarRadioGroup>
          </MenuSection>

          <MenubarSeparator />

          <MenuSection label={t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}>
            <Input
              aria-label={t("CONTENT_LIBRARY_EDITOR_MENU_SLUG")}
              value={props.slug}
              onChange={(event) => props.onSlugChange(event.target.value)}
              className="h-8"
            />
          </MenuSection>

          {props.onOpenSeo ? (
            <>
              <MenubarSeparator />
              <MenuItemWithShortcut
                icon={<Link2Icon className="size-4" />}
                label={t("CONTENT_LIBRARY_EDITOR_MENU_SEO")}
                onSelect={props.onOpenSeo}
              />
            </>
          ) : null}

          {props.mode === "split" && (props.onCloseSplit || props.onOpenPageEditor) ? (
            <>
              <MenubarSeparator />
              {props.onCloseSplit ? (
                <MenuItemWithShortcut
                  icon={<PanelRightClose className="size-4" />}
                  label={t("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")}
                  onSelect={props.onCloseSplit}
                />
              ) : null}
              {props.onOpenPageEditor ? (
                <MenuItemWithShortcut
                  icon={<Maximize2 className="size-4" />}
                  label={t("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")}
                  onSelect={props.onOpenPageEditor}
                />
              ) : null}
            </>
          ) : null}
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}</MenubarTrigger>
        <MenubarContent className="w-[16rem]">
          <MenubarLabel>{t("CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER")}</MenubarLabel>
          <MenubarSeparator />
          {MENUBAR_INSERT_ITEMS.map((item) => (
            <MenuItemWithShortcut
              key={item.value}
              icon={<item.icon className="size-4" />}
              label={
                item.value === KEYS.hr
                  ? t("CONTENT_LIBRARY_EDITOR_INSERT_DIVIDER")
                  : item.value === KEYS.blockquote
                    ? t("CONTENT_LIBRARY_EDITOR_INSERT_QUOTE")
                    : item.value === ARTICLE_EDITOR_INSERT_TOC
                      ? t("CONTENT_LIBRARY_EDITOR_INSERT_TOC")
                      : t(
                          item.value === KEYS.codeBlock
                            ? "CONTENT_LIBRARY_EDITOR_INSERT_CODE_BLOCK"
                            : item.value === KEYS.toggle
                              ? "CONTENT_LIBRARY_EDITOR_INSERT_TOGGLE"
                              : item.value === ARTICLE_EDITOR_INSERT_IMAGE
                                ? "CONTENT_LIBRARY_EDITOR_INSERT_IMAGE"
                                : item.value === ARTICLE_EDITOR_INSERT_VIDEO
                                  ? "CONTENT_LIBRARY_EDITOR_INSERT_VIDEO"
                                  : item.value === ARTICLE_EDITOR_INSERT_FILE
                                    ? "CONTENT_LIBRARY_EDITOR_INSERT_FILE"
                                    : item.value === KEYS.p
                                      ? "CONTENT_LIBRARY_EDITOR_INSERT_TEXT"
                                      : item.value === KEYS.h1
                                        ? "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_1"
                                        : item.value === KEYS.h2
                                          ? "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_2"
                                          : "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_3",
                        )
              }
              onSelect={() => handleInsert(item.value)}
              shortcut={MENUBAR_SHORTCUTS[item.value]}
            />
          ))}
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>{t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}</MenubarTrigger>
        <MenubarContent className="w-[16rem]">
          <MenubarLabel>{t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}</MenubarLabel>
          <MenubarSeparator />
          {TURN_INTO_MENU_ITEMS.map((item) => (
            <MenuItemWithShortcut
              key={item.value}
              icon={<item.icon className="size-4" />}
              label={t(item.labelKey)}
              onSelect={() => {
                withSelection(() => {
                  applyTurnInto(editor, item.value, currentTurnIntoValue ?? KEYS.p, {
                    openNextToggles,
                    setBlockType,
                    toggleList,
                    toggleTodoList,
                  });
                });
              }}
              shortcut={MENUBAR_SHORTCUTS[item.value]}
            />
          ))}

          <MenubarSeparator />

          <MenuItemWithShortcut
            icon={<BaselineIcon className="size-4" />}
            label={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}
            onSelect={() => handleToggleMark(KEYS.bold)}
            shortcut={MENUBAR_SHORTCUTS[KEYS.bold]}
          />
          <MenuItemWithShortcut
            icon={<ItalicIcon className="size-4" />}
            label={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}
            onSelect={() => handleToggleMark(KEYS.italic)}
            shortcut={MENUBAR_SHORTCUTS[KEYS.italic]}
          />
          <MenuItemWithShortcut
            icon={<UnderlineIcon className="size-4" />}
            label={t("CONTENT_LIBRARY_EDITOR_MARK_UNDERLINE")}
            onSelect={() => handleToggleMark(KEYS.underline)}
            shortcut={MENUBAR_SHORTCUTS[KEYS.underline]}
          />
          <MenuItemWithShortcut
            icon={<Code2 className="size-4" />}
            label={t("CONTENT_LIBRARY_EDITOR_MARK_CODE")}
            onSelect={() => handleToggleMark(KEYS.code)}
            shortcut={MENUBAR_SHORTCUTS[KEYS.code]}
          />

          <MenubarSeparator />

          <MenubarSub>
            <MenubarSubTrigger>
              <BaselineIcon className="size-4" />
              {t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR")}
            </MenubarSubTrigger>
            <MenubarSubContent className="w-[15rem]">
              {getEditorColorOptions().map((option) => (
                <MenubarItem
                  key={`text:${option.value}`}
                  onSelect={() => applyMenuColor(KEYS.color, option.color)}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      option.color ? "border-transparent" : "border-border/70 bg-card",
                    )}
                    style={option.color ? { backgroundColor: option.color } : undefined}
                  />
                  {t(option.labelKey)}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>

          <MenubarSub>
            <MenubarSubTrigger>
              <PaintBucketIcon className="size-4" />
              {t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR")}
            </MenubarSubTrigger>
            <MenubarSubContent className="w-[15rem]">
              {getEditorColorOptions().map((option) => (
                <MenubarItem
                  key={`background:${option.value}`}
                  onSelect={() => applyMenuColor(KEYS.backgroundColor, option.color)}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      option.color ? "border-transparent" : "border-border/70 bg-card",
                    )}
                    style={
                      option.color
                        ? { backgroundColor: `color-mix(in srgb, ${option.color} 28%, white)` }
                        : undefined
                    }
                  />
                  {option.color
                    ? `${t(option.labelKey)} ${t("CONTENT_LIBRARY_EDITOR_COLOR_BACKGROUND_SUFFIX")}`
                    : `${t(option.labelKey)} ${t("CONTENT_LIBRARY_EDITOR_COLOR_BACKGROUND_SUFFIX")}`}
                </MenubarItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
