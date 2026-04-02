"use client";

import type { PlateElementProps } from "platejs/react";

import { BlockSelectionPlugin } from "@platejs/selection/react";
import {
  PlateElement,
  useEditorRef,
  useEditorSelector,
  useFocused,
  usePluginOption,
} from "platejs/react";
import { useTranslation } from "react-i18next";

import { cn } from "@arclayer/lib/utils";
import { isExpandedSelection, shouldShowParagraphPlaceholder } from "./paragraph-placeholder";

function isSamePath(a: number[] | undefined, b: number[] | undefined) {
  if (!a || !b) return false;
  return a.length === b.length && a.every((segment, index) => segment === b[index]);
}

export function ParagraphElement(props: PlateElementProps) {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const focused = useFocused();
  const isCurrentBlock = useEditorSelector(
    (currentEditor) => {
      const currentBlockEntry = currentEditor.api.block();
      return isSamePath(currentBlockEntry?.[1], props.path);
    },
    [props.path],
  );
  const hasExpandedSelection = useEditorSelector(
    (currentEditor) =>
      Boolean(currentEditor.api.isExpanded?.()) || isExpandedSelection(currentEditor.selection),
    [],
  );
  const isSelectingBlocks = usePluginOption(BlockSelectionPlugin, "isSelectingSome");
  const showPlaceholder = shouldShowParagraphPlaceholder({
    editor,
    element: props.element,
    focused,
    hasExpandedSelection,
    isSelectingBlocks,
    path: props.path,
    selected: isCurrentBlock,
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
