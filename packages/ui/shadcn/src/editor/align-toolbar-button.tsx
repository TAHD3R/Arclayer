"use client";

import * as React from "react";

import type { Alignment } from "@platejs/basic-styles";

import { TextAlignPlugin } from "@platejs/basic-styles/react";
import { AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon } from "lucide-react";
import { useEditorPlugin, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";

const ALIGN_ITEMS = [
  { icon: AlignLeftIcon, labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_LEFT", value: "left" },
  { icon: AlignCenterIcon, labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_CENTER", value: "center" },
  { icon: AlignRightIcon, labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_RIGHT", value: "right" },
  {
    icon: AlignJustifyIcon,
    labelKey: "CONTENT_LIBRARY_EDITOR_MARK_ALIGN_JUSTIFY",
    value: "justify",
  },
] as const;

export function AlignToolbarButton() {
  const { t } = useTranslation("content");
  const { editor, tf } = useEditorPlugin(TextAlignPlugin);
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));
  const value =
    useSelectionFragmentProp({
      defaultValue: "left",
      getProp: (node) => node.align,
    }) ?? "left";
  const SelectedIcon = ALIGN_ITEMS.find((item) => item.value === value)?.icon ?? AlignLeftIcon;

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
      <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")}>
        <DropdownMenuTrigger asChild>
          <ToolbarButton
            pressed={open}
            tooltip={undefined}
            isDropdown
            onMouseDown={(event) => {
              event.preventDefault();
              selectionRef.current = captureEditorSelection(editor);
            }}
          >
            <SelectedIcon />
          </ToolbarButton>
        </DropdownMenuTrigger>
      </ToolbarTooltip>

      <DropdownMenuContent
        align="start"
        className="ignore-click-outside/toolbar min-w-[12rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => undefined, {
            selection: selectionRef.current,
          });
        }}
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            runEditorTransformPreservingSelection(
              editor,
              () => {
                tf.textAlign.setNodes(nextValue as Alignment);
              },
              { selection: selectionRef.current },
            );
          }}
        >
          {ALIGN_ITEMS.map(({ icon: Icon, labelKey, value: itemValue }) => (
            <DropdownMenuRadioItem key={itemValue} value={itemValue} className="min-w-[12rem]">
              <DropdownMenuItemContent icon={<Icon className="size-4" />}>
                {t(labelKey)}
              </DropdownMenuItemContent>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
