"use client";

import type { PlateElementProps } from "platejs/react";

import { PlateElement, useEditorRef, useFocused, useSelected } from "platejs/react";
import { useTranslation } from "react-i18next";

import { Checkbox } from "@arclayer/ui/checkbox";
import { cn } from "@arclayer/lib/utils";
import { shouldShowParagraphPlaceholder } from "./paragraph-placeholder";

type TodoParagraphElement = PlateElementProps["element"] & {
  checked?: boolean;
  listStyleType?: string;
};

export function ParagraphElement(props: PlateElementProps) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const focused = useFocused();
  const selected = useSelected();
  const path = editor.api.findPath(props.element);
  const currentElement = (path ? editor.api.node(path)?.[0] : null) as TodoParagraphElement | null;
  const isTodoParagraph =
    currentElement?.listStyleType === "todo" || typeof currentElement?.checked === "boolean";
  const checked = Boolean(currentElement?.checked);
  const showPlaceholder = shouldShowParagraphPlaceholder({
    element: props.element,
    focused,
    selected,
  });

  return (
    <PlateElement
      {...props}
      className={cn(
        "relative m-0 min-h-[1.5em] px-0 py-1",
        isTodoParagraph &&
          "pl-7 [&>ol]:m-0 [&>ol]:p-0 [&>ol>li]:list-none [&>ul]:m-0 [&>ul]:p-0 [&>ul>li]:list-none",
      )}
    >
      {isTodoParagraph ? (
        <Checkbox
          checked={checked}
          className="absolute left-0 top-1 border-border/80 data-[state=checked]:border-primary"
          contentEditable={false}
          onCheckedChange={(value) => {
            if (!path) return;
            editor.tf.setNodes({ checked: Boolean(value) }, { at: path });
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        />
      ) : null}
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
