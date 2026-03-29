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
import { ToolbarButton } from "./ui/toolbar";

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
  const value =
    useSelectionFragmentProp({
      defaultValue: "left",
      getProp: (node) => node.align,
    }) ?? "left";
  const SelectedIcon = ALIGN_ITEMS.find((item) => item.value === value)?.icon ?? AlignLeftIcon;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ALIGN")} isDropdown>
          <SelectedIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="ignore-click-outside/toolbar min-w-[12rem]">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            tf.textAlign.setNodes(nextValue as Alignment);
            editor.tf.focus();
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
