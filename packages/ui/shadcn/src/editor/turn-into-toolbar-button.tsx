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
import {
  ToolbarMenuGroup,
  ToolbarSplitButton,
  ToolbarSplitButtonPrimary,
  ToolbarSplitButtonSecondary,
  ToolbarTooltip,
} from "./ui/toolbar";
import {
  captureEditorSelection,
  runEditorTransformPreservingSelection,
  setBlockType,
} from "./transforms";

export function TurnIntoToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getTurnIntoValue(node as TElement),
  });

  const selectedItem = React.useMemo(
    () =>
      TURN_INTO_MENU_ITEMS.find((item) => item.value === (value ?? KEYS.p)) ??
      TURN_INTO_MENU_ITEMS[0],
    [value],
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
        <ToolbarSplitButton pressed={open}>
          <ToolbarSplitButtonPrimary
            className="min-w-16 justify-center px-3"
            aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
            onClick={() => setOpen(true)}
          >
            {t(selectedItem.labelKey)}
          </ToolbarSplitButtonPrimary>
          <DropdownMenuTrigger asChild>
            <ToolbarSplitButtonSecondary
              aria-label={t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
              onMouseDown={(event) => {
                event.preventDefault();
                selectionRef.current = captureEditorSelection(editor);
              }}
            />
          </DropdownMenuTrigger>
        </ToolbarSplitButton>
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
          {TURN_INTO_MENU_ITEMS.map((item) => {
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
