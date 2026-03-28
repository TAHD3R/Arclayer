"use client";

import * as React from "react";

import {
  KeyboardIcon,
  MoreHorizontalIcon,
  PaintbrushIcon,
  SubscriptIcon,
  SuperscriptIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/components/ui/toolbar";

export function MoreToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const toggleMark = (mark: string, remove?: string) => {
    editor.tf.toggleMark(mark, remove ? { remove } : undefined);
    editor.tf.focus();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_MORE")}>
          <MoreHorizontalIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="ignore-click-outside/toolbar min-w-[12rem]">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={() => toggleMark(KEYS.kbd)}>
            <KeyboardIcon />
            {t("CONTENT_LIBRARY_EDITOR_MARK_KEYBOARD")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleMark(KEYS.highlight)}>
            <PaintbrushIcon />
            {t("CONTENT_LIBRARY_EDITOR_MARK_HIGHLIGHT")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleMark(KEYS.sup, KEYS.sub)}>
            <SuperscriptIcon />
            {t("CONTENT_LIBRARY_EDITOR_MARK_SUPERSCRIPT")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => toggleMark(KEYS.sub, KEYS.sup)}>
            <SubscriptIcon />
            {t("CONTENT_LIBRARY_EDITOR_MARK_SUBSCRIPT")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
