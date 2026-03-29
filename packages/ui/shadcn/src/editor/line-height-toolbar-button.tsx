"use client";

import * as React from "react";

import { LineHeightPlugin } from "@platejs/basic-styles/react";
import { WrapTextIcon } from "lucide-react";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@arclayer/ui/dropdown-menu";
import { ToolbarButton } from "./ui/toolbar";

export function LineHeightToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const { defaultNodeValue = "1.5", validNodeValues: values = [] } = editor.getInjectProps(
    LineHeightPlugin,
  ) as {
    defaultNodeValue?: string;
    validNodeValues?: string[];
  };
  const value = useSelectionFragmentProp({
    defaultValue: defaultNodeValue,
    getProp: (node) => node.lineHeight,
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          pressed={open}
          tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_LINE_HEIGHT")}
          isDropdown
        >
          <WrapTextIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="ignore-click-outside/toolbar min-w-[11rem]">
        <DropdownMenuRadioGroup
          value={String(value ?? defaultNodeValue)}
          onValueChange={(nextValue) => {
            editor.getTransforms(LineHeightPlugin).lineHeight.setNodes(Number(nextValue));
            editor.tf.focus();
          }}
        >
          {values.map((itemValue) => (
            <DropdownMenuRadioItem key={itemValue} value={itemValue} className="min-w-[11rem]">
              {itemValue}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
