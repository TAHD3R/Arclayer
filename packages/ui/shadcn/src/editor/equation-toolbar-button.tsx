"use client";

import { insertInlineEquation } from "@platejs/math";
import { RadicalIcon } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { ToolbarButton } from "./ui/toolbar";

export function InlineEquationToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();

  return (
    <ToolbarButton
      {...props}
      onClick={() => insertInlineEquation(editor)}
      tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_EQUATION")}
    >
      <RadicalIcon />
    </ToolbarButton>
  );
}
