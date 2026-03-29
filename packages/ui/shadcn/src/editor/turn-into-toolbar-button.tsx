"use client";

import * as React from "react";

import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";
import {
  CheckIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  PilcrowIcon,
  QuoteIcon,
} from "lucide-react";
import { KEYS, type TElement } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { ToolbarButton, ToolbarMenuGroup } from "./ui/toolbar";
import {
  captureEditorSelection,
  getBlockType,
  runEditorTransformPreservingSelection,
  setBlockType,
} from "./transforms";

const TURN_INTO_ITEMS = [
  { icon: <PilcrowIcon />, value: KEYS.p, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_TEXT" },
  { icon: <Heading1Icon />, value: KEYS.h1, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_1" },
  { icon: <Heading2Icon />, value: KEYS.h2, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_2" },
  { icon: <Heading3Icon />, value: KEYS.h3, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_3" },
  { icon: <QuoteIcon />, value: KEYS.blockquote, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_QUOTE" },
] as const;

export function TurnIntoToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });

  const selectedItem = React.useMemo(
    () => TURN_INTO_ITEMS.find((item) => item.value === (value ?? KEYS.p)) ?? TURN_INTO_ITEMS[0],
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
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="min-w-[7.5rem]"
          pressed={open}
          tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_TURN_INTO")}
          isDropdown
          onMouseDown={(event) => {
            event.preventDefault();
            selectionRef.current = captureEditorSelection(editor);
          }}
        >
          {t(selectedItem.labelKey)}
        </ToolbarButton>
      </DropdownMenuTrigger>
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
                setBlockType(editor, nextType);
              },
              { selection: selectionRef.current },
            );
          }}
        >
          {TURN_INTO_ITEMS.map((item) => (
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
              {item.icon}
              {t(item.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
