"use client";

import * as React from "react";

import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "lucide-react";
import { toggleList } from "@platejs/list";
import { openNextToggles } from "@platejs/toggle/react";
import { KEYS, type TElement } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { toggleTodoList } from "./article-editor-insert-items";
import { applyTurnInto, getTurnIntoValue } from "./turn-into-helpers";
import { TURN_INTO_MENU_ITEMS } from "./turn-into-menu-items";
import { ToolbarButton, ToolbarMenuGroup, ToolbarTooltip } from "./ui/toolbar";
import {
  captureEditorSelection,
  runEditorTransformPreservingSelection,
  setBlockType,
} from "./transforms";

export function TurnIntoToolbarButton(props: { allowedValues?: readonly string[] }) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getTurnIntoValue(node as TElement),
  });

  const items = React.useMemo(() => {
    if (!props.allowedValues) return TURN_INTO_MENU_ITEMS;
    const allowedValues = new Set(props.allowedValues);
    return TURN_INTO_MENU_ITEMS.filter((item) => allowedValues.has(item.value));
  }, [props.allowedValues]);
  const selectedItem = React.useMemo(
    () =>
      items.find((item) => item.value === (value ?? KEYS.p)) ?? items[0] ?? TURN_INTO_MENU_ITEMS[0],
    [items, value],
  );

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          selectionRef.current = captureEditorSelection(editor);
        }
        setOpen(nextOpen);
      }}
      modal={false}
    >
      <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            pressed={open}
            isDropdown
            className="min-w-16 justify-between"
            aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
          >
            {t(selectedItem.labelKey)}
          </ToolbarButton>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <ToolbarMenuGroup
          label={t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
          value={value}
          onValueChange={(nextType) => {
            runEditorTransformPreservingSelection(
              editor,
              () => {
                applyTurnInto(editor, nextType, value, {
                  openNextToggles,
                  setBlockType,
                  toggleList,
                  toggleTodoList,
                });
              },
              { selection: selectionRef.current },
            );
          }}
        >
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <DropdownMenuRadioItem
                key={item.value}
                value={item.value}
                className="min-w-[12rem] pl-2 *:first:[span]:hidden"
              >
                <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                  <DropdownMenuItemIndicator>
                    <CheckIcon className="size-3.5" />
                  </DropdownMenuItemIndicator>
                </span>
                <Icon />
                {t(item.labelKey)}
              </DropdownMenuRadioItem>
            );
          })}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
