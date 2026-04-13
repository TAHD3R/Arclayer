"use client";

import { insertInlineEquation } from "@platejs/math";
import { RadicalIcon } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { ToolbarButton, ToolbarTooltip } from "./ui/toolbar";

export function InlineEquationToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();

  return (
    <ToolbarTooltip tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_EQUATION")}>
      <ToolbarButton {...props} onClick={() => insertInlineEquation(editor)} tooltip={undefined}>
        <RadicalIcon />
      </ToolbarButton>
    </ToolbarTooltip>
  );
}
