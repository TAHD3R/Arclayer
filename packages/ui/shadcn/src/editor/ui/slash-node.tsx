"use client";

import * as React from "react";

import { CheckIcon, CopyIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { toggleList } from "@platejs/list";
import { openNextToggles } from "@platejs/toggle/react";
import { KEYS, type Path, type TComboboxInputElement, type TElement } from "platejs";
import { PlateElement, type PlateElementProps } from "platejs/react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";

import {
  applyArticleEditorInsertItem,
  getArticleEditorInsertGroups,
  toggleTodoList,
} from "../article-editor-insert-items";
import { useArticleEditorCommands } from "../article-editor-command-context";
import {
  clearEditorMarkColorForBlocks,
  doesEditorMarkColorMatch,
  getEditorColorOptions,
  getEditorMarkValueForBlocks,
  setEditorMarkColorForBlocks,
} from "../mark-color-utils";
import { applyTurnInto, getTurnIntoValue } from "../turn-into-helpers";
import { TURN_INTO_MENU_ITEMS } from "../turn-into-menu-items";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type BlockEntry = [TElement, Path];
type Translate = (key: string, options?: Record<string, unknown>) => string;

type SlashCommandGroup = {
  id: string;
  label: string;
  items: SlashCommandItem[];
};

type SlashCommandItem =
  | {
      description?: string;
      focusEditor?: boolean;
      group: string;
      icon: LucideIcon;
      kind: "insert";
      keywords?: string[];
      label: string;
      value: string;
    }
  | {
      active: boolean;
      description?: string;
      focusEditor?: boolean;
      group: string;
      icon: LucideIcon;
      kind: "turn-into";
      keywords?: string[];
      label: string;
      value: string;
    }
  | {
      description?: string;
      focusEditor?: boolean;
      group: string;
      icon: LucideIcon;
      kind: "duplicate" | "delete";
      keywords?: string[];
      label: string;
      value: string;
    }
  | {
      active: boolean;
      color?: string;
      description?: string;
      focusEditor?: boolean;
      group: string;
      kind: "apply-color" | "clear-color";
      keywords?: string[];
      label: string;
      nodeType: string;
      value: string;
    };

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

function buildColorItems(props: {
  currentColor: string | null;
  group: string;
  groupId: string;
  nodeType: string;
  t: Translate;
}): SlashCommandItem[] {
  const colorItems = getEditorColorOptions()
    .filter((option) => option.color !== null)
    .map((option) => ({
      active: doesEditorMarkColorMatch(props.nodeType, props.currentColor, String(option.color)),
      color: String(option.color),
      description: props.group,
      focusEditor: true,
      group: props.group,
      kind: "apply-color" as const,
      keywords: [...option.keywords, "color", props.groupId],
      label:
        props.nodeType === KEYS.backgroundColor
          ? `${props.t(option.labelKey)} ${props.t("CONTENT_LIBRARY_EDITOR_COLOR_BACKGROUND_SUFFIX")}`
          : props.t(option.labelKey),
      nodeType: props.nodeType,
      value: `${props.groupId}:${option.color}`,
    }));

  return [
    {
      active: !props.currentColor,
      description: props.group,
      focusEditor: true,
      group: props.group,
      kind: "clear-color" as const,
      keywords: ["clear", "remove", "reset", "none", props.groupId, "color"],
      label:
        props.nodeType === KEYS.backgroundColor
          ? `${props.t("CONTENT_LIBRARY_EDITOR_COLOR_NAME_DEFAULT")} ${props.t("CONTENT_LIBRARY_EDITOR_COLOR_BACKGROUND_SUFFIX")}`
          : props.t("CONTENT_LIBRARY_EDITOR_COLOR_NAME_DEFAULT"),
      nodeType: props.nodeType,
      value: `${props.groupId}:clear`,
    },
    ...colorItems,
  ];
}

export function buildSlashCommandGroups(props: {
  currentBackgroundColor: string | null;
  currentTextColor: string | null;
  currentTurnIntoValue: string | null;
  t: Translate;
}): SlashCommandGroup[] {
  const insertGroups = getArticleEditorInsertGroups(props.t);
  const slashGroups: SlashCommandGroup[] = insertGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.items.map((item) => ({
      description: item.description,
      focusEditor: true,
      group: group.label,
      icon: item.icon,
      kind: "insert" as const,
      keywords: item.keywords,
      label: item.label,
      value: item.value,
    })),
  }));

  slashGroups.push({
    id: "turn-into",
    label: props.t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO"),
    items: TURN_INTO_MENU_ITEMS.map((item) => ({
      active: props.currentTurnIntoValue === item.value,
      description: props.t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO"),
      focusEditor: true,
      group: props.t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO"),
      icon: item.icon,
      kind: "turn-into" as const,
      keywords: ["turn into", "transform", "change block", item.value],
      label: props.t(item.labelKey),
      value: item.value,
    })),
  });

  slashGroups.push({
    id: "actions",
    label: props.t("CONTENT_LIBRARY_EDITOR_ACTIONS"),
    items: [
      {
        description: props.t("CONTENT_LIBRARY_EDITOR_ACTIONS"),
        focusEditor: true,
        group: props.t("CONTENT_LIBRARY_EDITOR_ACTIONS"),
        icon: CopyIcon,
        kind: "duplicate" as const,
        keywords: ["duplicate", "copy", "clone"],
        label: props.t("common:DUPLICATE"),
        value: "duplicate",
      },
      {
        description: props.t("CONTENT_LIBRARY_EDITOR_ACTIONS"),
        focusEditor: false,
        group: props.t("CONTENT_LIBRARY_EDITOR_ACTIONS"),
        icon: Trash2Icon,
        kind: "delete" as const,
        keywords: ["delete", "remove", "trash"],
        label: props.t("common:DELETE"),
        value: "delete",
      },
    ],
  });

  slashGroups.push({
    id: "text-color",
    label: props.t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR"),
    items: buildColorItems({
      currentColor: props.currentTextColor,
      group: props.t("CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR"),
      groupId: "text",
      nodeType: KEYS.color,
      t: props.t,
    }),
  });

  slashGroups.push({
    id: "background-color",
    label: props.t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR"),
    items: buildColorItems({
      currentColor: props.currentBackgroundColor,
      group: props.t("CONTENT_LIBRARY_EDITOR_MARK_BACKGROUND_COLOR"),
      groupId: "background",
      nodeType: KEYS.backgroundColor,
      t: props.t,
    }),
  });

  return slashGroups;
}

function SlashCommandItemRow(props: { item: SlashCommandItem }) {
  const leading =
    "color" in props.item && props.item.color ? (
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 rounded-sm border",
          props.item.color === "#000000" ? "border-border/70" : "border-transparent",
        )}
        style={{ backgroundColor: props.item.color }}
      />
    ) : "icon" in props.item ? (
      <props.item.icon className="mt-0.5 size-4 shrink-0 text-label-secondary" />
    ) : null;

  const destructive = props.item.kind === "delete";

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="flex min-h-4 shrink-0 items-center justify-center">{leading}</div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-footnote font-medium",
            destructive ? "text-destructive" : "text-label-primary",
          )}
        >
          {props.item.label}
        </div>
        {props.item.description ? (
          <div className="truncate text-caption text-label-secondary">{props.item.description}</div>
        ) : null}
      </div>
      {"active" in props.item && props.item.active ? (
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-label-secondary" />
      ) : null}
    </div>
  );
}

function SlashMenuContent(props: PlateElementProps<TComboboxInputElement>) {
  const { t } = useTranslation(["content", "common"]);
  const commands = useArticleEditorCommands();

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

  const groups = React.useMemo(() => {
    if (!currentBlock) {
      return getArticleEditorInsertGroups(t).map((group) => ({
        id: group.id,
        label: group.label,
        items: group.items.map((item) => ({
          description: item.description,
          focusEditor: true,
          group: group.label,
          icon: item.icon,
          kind: "insert" as const,
          keywords: item.keywords,
          label: item.label,
          value: item.value,
        })),
      }));
    }

    return buildSlashCommandGroups({
      currentBackgroundColor,
      currentTextColor,
      currentTurnIntoValue,
      t,
    });
  }, [currentBackgroundColor, currentBlock, currentTextColor, currentTurnIntoValue, t]);

  const insertItem = React.useCallback(
    (value: string) => {
      if (commands?.insertItem) {
        commands.insertItem(props.editor, value);
        return;
      }

      applyArticleEditorInsertItem(props.editor, value);
    },
    [commands, props.editor],
  );

  const handleTurnInto = React.useCallback(
    (nextType: string) => {
      const blockEntry = resolveCurrentBlock();
      if (!blockEntry) return;

      const [block, path] = blockEntry;
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
    [props.editor, resolveCurrentBlock],
  );

  const handleDuplicate = React.useCallback(() => {
    const blockEntry = resolveCurrentBlock();
    if (!blockEntry?.[0].id) return;

    props.editor.getApi(BlockSelectionPlugin).blockSelection.set([String(blockEntry[0].id)]);
    props.editor.getTransforms(BlockSelectionPlugin).blockSelection.duplicate();
    props.editor.getApi(BlockSelectionPlugin).blockSelection.deselect();
    props.editor.tf.focus();
  }, [props.editor, resolveCurrentBlock]);

  const handleDelete = React.useCallback(() => {
    const blockEntry = resolveCurrentBlock();
    if (!blockEntry) return;

    removeCurrentBlock(props.editor, blockEntry);
    props.editor.tf.focus();
  }, [props.editor, resolveCurrentBlock]);

  const handleApplyColor = React.useCallback(
    (nodeType: string, color: string) => {
      const blockEntry = resolveCurrentBlock();
      if (!blockEntry) return;

      setEditorMarkColorForBlocks(props.editor, nodeType, color, [blockEntry]);
      props.editor.tf.focus();
    },
    [props.editor, resolveCurrentBlock],
  );

  const handleClearColor = React.useCallback(
    (nodeType: string) => {
      const blockEntry = resolveCurrentBlock();
      if (!blockEntry) return;

      clearEditorMarkColorForBlocks(props.editor, nodeType, [blockEntry]);
      props.editor.tf.focus();
    },
    [props.editor, resolveCurrentBlock],
  );

  const handleSelect = React.useCallback(
    (item: SlashCommandItem) => {
      switch (item.kind) {
        case "insert":
          insertItem(item.value);
          return;
        case "turn-into":
          handleTurnInto(item.value);
          return;
        case "duplicate":
          handleDuplicate();
          return;
        case "delete":
          handleDelete();
          return;
        case "clear-color":
          handleClearColor(item.nodeType);
          return;
        case "apply-color":
          if (!item.color) return;
          handleApplyColor(item.nodeType, item.color);
      }
    },
    [handleApplyColor, handleClearColor, handleDelete, handleDuplicate, handleTurnInto, insertItem],
  );

  return (
    <>
      <InlineComboboxInput className="text-footnote text-label-primary" />

      <InlineComboboxContent className="z-500 max-h-[24rem] w-[18rem] overflow-y-auto rounded-md border border-border/70 bg-popover p-0 shadow-lg">
        <InlineComboboxEmpty className="py-2 text-label-secondary">
          {t("CONTENT_LIBRARY_EDITOR_INSERT_EMPTY")}
        </InlineComboboxEmpty>

        {groups.map((group) => (
          <InlineComboboxGroup key={group.id}>
            <InlineComboboxGroupLabel>{group.label}</InlineComboboxGroupLabel>

            {group.items.map((item) => (
              <InlineComboboxItem
                key={item.value}
                value={item.value}
                label={item.label}
                group={item.group}
                keywords={item.keywords}
                focusEditor={item.focusEditor}
                className="mx-1 h-auto min-h-10 items-start py-2"
                onClick={() => handleSelect(item)}
              >
                <SlashCommandItemRow item={item} />
              </InlineComboboxItem>
            ))}
          </InlineComboboxGroup>
        ))}
      </InlineComboboxContent>
    </>
  );
}

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger="/">
        <span className="inline-flex items-center align-baseline">
          <SlashMenuContent {...props} />
        </span>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
