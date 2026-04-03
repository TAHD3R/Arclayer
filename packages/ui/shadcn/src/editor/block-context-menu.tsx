"use client";

import * as React from "react";

import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";
import {
  BLOCK_CONTEXT_MENU_ID,
  BlockMenuPlugin,
  BlockSelectionPlugin,
} from "@platejs/selection/react";
import { toggleList } from "@platejs/list";
import { openNextToggles } from "@platejs/toggle/react";
import {
  BaselineIcon,
  CheckIcon,
  CopyIcon,
  PaintBucketIcon,
  PilcrowIcon,
  Trash2Icon,
} from "lucide-react";
import { type Path, type TElement, KEYS, PathApi } from "platejs";
import { useEditorPlugin, useEditorRef, usePluginOption } from "platejs/react";
import { useTranslation } from "react-i18next";

import { toggleTodoList } from "./article-editor-insert-items";
import { getBlockContextMenuActionIds } from "./block-menu-helpers";
import { ColorDropdownSubmenu } from "./color-dropdown-submenu";
import {
  clearEditorMarkColorForBlocks,
  getEditorMarkValueForBlocks,
  setEditorMarkColorForBlocks,
} from "./mark-color-utils";
import { applyTurnInto, getTurnIntoValue } from "./turn-into-helpers";
import { TURN_INTO_MENU_ITEMS } from "./turn-into-menu-items";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuIconItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";

function removeSelectedBlocks(
  editor: ReturnType<typeof useEditorRef>,
  entries: [TElement, Path][],
) {
  editor.tf.withoutNormalizing(() => {
    [...entries]
      .sort(([, pathA], [, pathB]) => PathApi.compare(pathB, pathA))
      .forEach(([, path]) => {
        editor.tf.removeNodes({ at: path });
      });

    if (editor.children.length > 0) return;

    editor.tf.insertNodes(editor.api.create.block({ type: editor.getType(KEYS.p) }), {
      at: [0],
      select: true,
    });
  });
}

export function BlockContextMenu(props: { children?: React.ReactNode }) {
  const { t } = useTranslation(["content", "common"]);
  const editor = useEditorRef();
  const { api } = useEditorPlugin(BlockMenuPlugin);
  const openId = usePluginOption(BlockMenuPlugin, "openId");
  const position = usePluginOption(BlockMenuPlugin, "position");
  const selectedIds = usePluginOption(BlockSelectionPlugin, "selectedIds");

  const isOpen = openId === BLOCK_CONTEXT_MENU_ID;
  const selectedBlocks = React.useMemo(
    () =>
      editor.getApi(BlockSelectionPlugin).blockSelection.getNodes({
        sort: true,
      }) as [TElement, Path][],
    [editor, selectedIds],
  );
  const selectedBlock = selectedBlocks.length === 1 ? selectedBlocks[0] : null;
  const currentTurnIntoValue = selectedBlock ? getTurnIntoValue(selectedBlock[0]) : null;
  const actionIds = React.useMemo(
    () => getBlockContextMenuActionIds(selectedBlocks.length),
    [selectedBlocks.length],
  );
  const currentTextColor = React.useMemo(
    () => getEditorMarkValueForBlocks(selectedBlocks, KEYS.color),
    [selectedBlocks],
  );
  const currentBackgroundColor = React.useMemo(
    () => getEditorMarkValueForBlocks(selectedBlocks, KEYS.backgroundColor),
    [selectedBlocks],
  );

  const hideMenu = React.useCallback(() => {
    api.blockMenu.hide();
  }, [api.blockMenu]);

  const focusBlockSelection = React.useCallback(() => {
    editor.getApi(BlockSelectionPlugin).blockSelection.focus();
  }, [editor]);

  const handleDuplicate = React.useCallback(() => {
    editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
    hideMenu();
    window.setTimeout(() => {
      focusBlockSelection();
    }, 0);
  }, [editor, focusBlockSelection, hideMenu]);

  const handleDelete = React.useCallback(() => {
    if (selectedBlocks.length === 0) return;

    removeSelectedBlocks(editor, selectedBlocks);
    editor.getApi(BlockSelectionPlugin).blockSelection.deselect();
    hideMenu();
    editor.tf.focus();
  }, [editor, hideMenu, selectedBlocks]);

  const handleTurnInto = React.useCallback(
    (nextType: string) => {
      if (!selectedBlock) return;

      const [block, path] = selectedBlock;
      editor.tf.select(path);
      applyTurnInto(editor, nextType, currentTurnIntoValue, {
        openNextToggles,
        setBlockType: (activeEditor, type) => {
          activeEditor.tf.setNodes({ type }, { at: path });
        },
        toggleList,
        toggleTodoList,
      });
      editor.getApi(BlockSelectionPlugin).blockSelection.set(String(block.id));
      hideMenu();
      focusBlockSelection();
    },
    [currentTurnIntoValue, editor, focusBlockSelection, hideMenu, selectedBlock],
  );
  const handleApplyColor = React.useCallback(
    (nodeType: string, color: string) => {
      if (selectedBlocks.length === 0) return;

      setEditorMarkColorForBlocks(editor, nodeType, color, selectedBlocks);
      hideMenu();
      focusBlockSelection();
    },
    [editor, focusBlockSelection, hideMenu, selectedBlocks],
  );
  const handleClearColor = React.useCallback(
    (nodeType: string) => {
      if (selectedBlocks.length === 0) return;

      clearEditorMarkColorForBlocks(editor, nodeType, selectedBlocks);
      hideMenu();
      focusBlockSelection();
    },
    [editor, focusBlockSelection, hideMenu, selectedBlocks],
  );

  return (
    <>
      {props.children}
      <DropdownMenu
        open={isOpen}
        modal={false}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            hideMenu();
            focusBlockSelection();
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none fixed h-px w-px opacity-0"
            style={{ left: position.x, top: position.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="min-w-[14rem]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusBlockSelection();
          }}
        >
          {actionIds.includes("turn-into") && selectedBlock ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <PilcrowIcon className="size-4" />
                {t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-[14rem]">
                {TURN_INTO_MENU_ITEMS.map((item) => {
                  const Icon = item.icon;

                  return (
                    <DropdownMenuItem
                      key={item.value}
                      className="pl-2 *:first:[span]:hidden"
                      onSelect={(event) => {
                        event.preventDefault();
                        handleTurnInto(item.value);
                      }}
                    >
                      {currentTurnIntoValue === item.value ? (
                        <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                          <DropdownMenuItemIndicator>
                            <CheckIcon className="size-3.5" />
                          </DropdownMenuItemIndicator>
                        </span>
                      ) : null}
                      <Icon className="size-4" />
                      {t(item.labelKey)}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}

          {selectedBlocks.length > 0 ? (
            <>
              {actionIds.includes("turn-into") || actionIds.includes("duplicate") ? (
                <DropdownMenuSeparator />
              ) : null}
              <ColorDropdownSubmenu
                icon={<BaselineIcon className="size-4" />}
                label={t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR")}
                nodeType={KEYS.color}
                currentColor={currentTextColor}
                clearLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
                onSelectColor={(color) => handleApplyColor(KEYS.color, color)}
                onClear={() => handleClearColor(KEYS.color)}
              />
              <ColorDropdownSubmenu
                icon={<PaintBucketIcon className="size-4" />}
                label={t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR")}
                nodeType={KEYS.backgroundColor}
                currentColor={currentBackgroundColor}
                clearLabel={t("CONTENT_LIBRARY_EDITOR_COLOR_CLEAR")}
                onSelectColor={(color) => handleApplyColor(KEYS.backgroundColor, color)}
                onClear={() => handleClearColor(KEYS.backgroundColor)}
              />
              <DropdownMenuSeparator />
            </>
          ) : null}

          {actionIds.includes("duplicate") ? (
            <DropdownMenuIconItem icon={<CopyIcon className="size-4" />} onSelect={handleDuplicate}>
              {t("common:DUPLICATE")}
            </DropdownMenuIconItem>
          ) : null}

          {actionIds.includes("delete") ? (
            <DropdownMenuIconItem
              icon={<Trash2Icon className="size-4" />}
              variant="destructive"
              onSelect={handleDelete}
            >
              {t("common:DELETE")}
            </DropdownMenuIconItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
