"use client";

import * as React from "react";

import { BaselineIcon, CheckIcon, CopyIcon, PaintBucketIcon, Trash2Icon } from "lucide-react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { toggleList } from "@platejs/list";
import { openNextToggles } from "@platejs/toggle/react";
import { KEYS, type Path, type TComboboxInputElement, type TElement } from "platejs";
import { PlateElement, type PlateElementProps } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuItem,
  DropdownMenuItemContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { cn } from "@arclayer/lib/utils";

import {
  applyArticleEditorInsertItem,
  getArticleEditorInsertGroups,
  toggleTodoList,
} from "../article-editor-insert-items";
import { useArticleEditorCommands } from "../article-editor-command-context";
import { ColorDropdownSubmenu } from "../color-dropdown-submenu";
import {
  clearEditorMarkColorForBlocks,
  getEditorMarkValueForBlocks,
  setEditorMarkColorForBlocks,
} from "../mark-color-utils";
import { applyTurnInto, getTurnIntoValue } from "../turn-into-helpers";
import { TURN_INTO_MENU_ITEMS } from "../turn-into-menu-items";

import { InlineCombobox, useInlineComboboxContext } from "./inline-combobox";

type BlockEntry = [TElement, Path];

function removeCurrentBlock(editor: PlateElementProps["editor"], blockEntry: BlockEntry) {
  const [, path] = blockEntry;

  editor.tf.withoutNormalizing(() => {
    editor.tf.removeNodes({ at: path });

    if (editor.children.length > 0) return;

    editor.tf.insertNodes(editor.api.create.block({ type: editor.getType(KEYS.p) }), {
      at: [0],
      select: true,
    });
  });
}

function SlashMenuContent(props: PlateElementProps<TComboboxInputElement>) {
  const { t } = useTranslation(["content", "common"]);
  const commands = useArticleEditorCommands();
  const { removeInput } = useInlineComboboxContext();
  const [open, setOpen] = React.useState(true);
  const closingRef = React.useRef(false);
  const groups = React.useMemo(() => getArticleEditorInsertGroups(t), [t]);

  const resolveCurrentBlock = React.useCallback(() => {
    return props.editor.api.block({
      above: true,
      at: props.path,
    }) as BlockEntry | null;
  }, [props.editor, props.path]);

  const currentBlock = resolveCurrentBlock();
  const currentTurnIntoValue = currentBlock ? getTurnIntoValue(currentBlock[0]) : null;
  const currentTextColor = currentBlock
    ? getEditorMarkValueForBlocks([currentBlock], KEYS.color)
    : null;
  const currentBackgroundColor = currentBlock
    ? getEditorMarkValueForBlocks([currentBlock], KEYS.backgroundColor)
    : null;

  const closeMenu = React.useCallback(
    (focusEditor: boolean) => {
      closingRef.current = true;
      removeInput(focusEditor);
      setOpen(false);
    },
    [removeInput],
  );

  const insertItem = React.useCallback(
    (value: string) => {
      closeMenu(true);

      if (commands?.insertItem) {
        commands.insertItem(props.editor, value);
        return;
      }

      applyArticleEditorInsertItem(props.editor, value);
    },
    [closeMenu, commands, props.editor],
  );

  const handleTurnInto = React.useCallback(
    (nextType: string) => {
      const blockEntry = resolveCurrentBlock();
      if (!blockEntry) return;

      const [block, path] = blockEntry;
      closeMenu(true);
      props.editor.tf.select(path);
      applyTurnInto(props.editor, nextType, getTurnIntoValue(block), {
        openNextToggles,
        setBlockType: (activeEditor, type) => {
          activeEditor.tf.setNodes({ type }, { at: path });
        },
        toggleList,
        toggleTodoList,
      });
    },
    [closeMenu, props.editor, resolveCurrentBlock],
  );

  const handleDuplicate = React.useCallback(() => {
    const blockEntry = resolveCurrentBlock();
    if (!blockEntry?.[0].id) return;

    closeMenu(true);
    props.editor.getApi(BlockSelectionPlugin).blockSelection.set([String(blockEntry[0].id)]);
    props.editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
    props.editor.getApi(BlockSelectionPlugin).blockSelection.deselect();
    props.editor.tf.focus();
  }, [closeMenu, props.editor, resolveCurrentBlock]);

  const handleDelete = React.useCallback(() => {
    const blockEntry = resolveCurrentBlock();
    if (!blockEntry) return;

    closeMenu(false);
    removeCurrentBlock(props.editor, blockEntry);
    props.editor.tf.focus();
  }, [closeMenu, props.editor, resolveCurrentBlock]);

  const handleApplyColor = React.useCallback(
    (nodeType: string, color: string) => {
      const blockEntry = resolveCurrentBlock();
      if (!blockEntry) return;

      closeMenu(true);
      setEditorMarkColorForBlocks(props.editor, nodeType, color, [blockEntry]);
      props.editor.tf.focus();
    },
    [closeMenu, props.editor, resolveCurrentBlock],
  );

  const handleClearColor = React.useCallback(
    (nodeType: string) => {
      const blockEntry = resolveCurrentBlock();
      if (!blockEntry) return;

      closeMenu(true);
      clearEditorMarkColorForBlocks(props.editor, nodeType, [blockEntry]);
      props.editor.tf.focus();
    },
    [closeMenu, props.editor, resolveCurrentBlock],
  );

  return (
    <DropdownMenu
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          if (closingRef.current) {
            closingRef.current = false;
            return;
          }
          removeInput(false);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-[1lh] items-center gap-1 rounded-sm px-1 text-footnote font-medium text-label-tertiary transition-colors hover:bg-accent/60 hover:text-label-primary"
          onMouseDown={(event) => event.preventDefault()}
        >
          /
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-[16rem] rounded-md border border-border/70 p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
      >
        <div className="max-h-[24rem] overflow-y-auto p-1">
          {groups.map((group, index) => (
            <React.Fragment key={group.id}>
              {index > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-callout! text-label-secondary">
                {group.label}
              </DropdownMenuLabel>
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <DropdownMenuItem key={item.value} onSelect={() => insertItem(item.value)}>
                    <DropdownMenuItemContent icon={<Icon className="size-4" />}>
                      {item.label}
                    </DropdownMenuItemContent>
                  </DropdownMenuItem>
                );
              })}
            </React.Fragment>
          ))}

          {currentBlock ? (
            <>
              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  {t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[14rem]">
                  {TURN_INTO_MENU_ITEMS.map((item) => {
                    const Icon = item.icon;

                    return (
                      <DropdownMenuItem
                        key={item.value}
                        onSelect={() => handleTurnInto(item.value)}
                      >
                        <DropdownMenuItemContent icon={<Icon className="size-4" />}>
                          <span className="flex items-center justify-between gap-2">
                            <span>{t(item.labelKey)}</span>
                            {currentTurnIntoValue === item.value ? (
                              <CheckIcon className="size-4 text-label-secondary" />
                            ) : null}
                          </span>
                        </DropdownMenuItemContent>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  {t("CONTENT_LIBRARY_EDITOR_ACTIONS")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="min-w-[12rem]">
                  <DropdownMenuIconItem
                    icon={<CopyIcon className="size-4" />}
                    onSelect={handleDuplicate}
                  >
                    {t("common:DUPLICATE")}
                  </DropdownMenuIconItem>
                  <DropdownMenuIconItem
                    icon={<Trash2Icon className="size-4" />}
                    variant="destructive"
                    onSelect={handleDelete}
                  >
                    {t("common:DELETE")}
                  </DropdownMenuIconItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <ColorDropdownSubmenu
                clearLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
                currentColor={currentTextColor}
                icon={<BaselineIcon className="size-4" />}
                label={t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR")}
                nodeType={KEYS.color}
                onSelectColor={(color) => handleApplyColor(KEYS.color, color)}
                onClear={() => handleClearColor(KEYS.color)}
              />
              <ColorDropdownSubmenu
                clearLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
                currentColor={currentBackgroundColor}
                icon={<PaintBucketIcon className="size-4" />}
                label={t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR")}
                nodeType={KEYS.backgroundColor}
                onSelectColor={(color) => handleApplyColor(KEYS.backgroundColor, color)}
                onClear={() => handleClearColor(KEYS.backgroundColor)}
              />
            </>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger="/">
        <span contentEditable={false} className={cn("inline-flex items-center")}>
          <SlashMenuContent {...props} />
        </span>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
