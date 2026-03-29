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
} from "@arclayer/ui/dropdown-menu";
import { captureEditorSelection, runEditorTransformPreservingSelection } from "./transforms";
import { ToolbarButton } from "./ui/toolbar";

export function MoreToolbarButton() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const selectionRef = React.useRef(captureEditorSelection(editor));

  const toggleMark = (mark: string, remove?: string) => {
    runEditorTransformPreservingSelection(
      editor,
      () => {
        editor.tf.toggleMark(mark, remove ? { remove } : undefined);
      },
      { selection: selectionRef.current },
    );
  };

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
          pressed={open}
          tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_MORE")}
          onMouseDown={(event) => {
            event.preventDefault();
            selectionRef.current = captureEditorSelection(editor);
          }}
        >
          <MoreHorizontalIcon />
        </ToolbarButton>
      </DropdownMenuTrigger>
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
