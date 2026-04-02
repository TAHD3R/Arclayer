"use client";

import type { PlateElementProps } from "platejs/react";

import { PlateElement, useEditorRef, useFocused, useSelected } from "platejs/react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { shouldShowParagraphPlaceholder } from "./paragraph-placeholder";

export function ParagraphElement(props: PlateElementProps) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const focused = useFocused();
  const selected = useSelected();
  const showPlaceholder = shouldShowParagraphPlaceholder({
    editor,
    element: props.element,
    focused,
    path: props.path,
    selected,
  });

  return (
    <PlateElement {...props} className={cn("relative m-0 min-h-[1.5em] px-0", props.className)}>
      {showPlaceholder ? (
        <span
          contentEditable={false}
          className="pointer-events-none absolute left-0 top-1 text-label-tertiary"
        >
          {t("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")}
        </span>
      ) : null}
      {props.children}
    </PlateElement>
  );
}
