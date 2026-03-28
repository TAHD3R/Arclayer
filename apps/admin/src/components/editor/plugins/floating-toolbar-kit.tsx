"use client";

import * as React from "react";

import {
  flip,
  offset,
  shift,
  useFloatingToolbar,
  useFloatingToolbarState,
} from "@platejs/floating";
import { useEditorRef } from "platejs/react";
import { useTranslation } from "react-i18next";

import { LinkToolbarButton } from "@/components/editor/link-toolbar-button";
import { MarkToolbarButton } from "@/components/ui/mark-toolbar-button";
import { Toolbar, ToolbarGroup, ToolbarSeparator } from "@/components/ui/toolbar";

type FloatingToolbarRef =
  | ((node: HTMLDivElement | null) => void)
  | React.MutableRefObject<HTMLDivElement | null>;

function assignFloatingToolbarRef(
  target: FloatingToolbarRef | null | undefined,
  node: HTMLDivElement | null,
) {
  if (!target) return;
  if (typeof target === "function") {
    target(node);
    return;
  }
  target.current = node;
}

export function PlateFloatingToolbar() {
  const { t } = useTranslation("content");
  const editor = useEditorRef();
  const state = useFloatingToolbarState({
    editorId: editor.id,
    floatingOptions: {
      middleware: [offset(10), flip(), shift({ padding: 12 })],
      placement: "top",
    },
    focusedEditorId: editor.id,
  });
  const { clickOutsideRef, hidden, props, ref } = useFloatingToolbar(state);

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      assignFloatingToolbarRef(ref, node);
      assignFloatingToolbarRef(clickOutsideRef as FloatingToolbarRef, node);
    },
    [clickOutsideRef, ref],
  );

  if (hidden) return null;

  return (
    <div
      ref={setRefs}
      style={props.style}
      className="ignore-click-outside/toolbar z-50"
      onMouseDown={(event) => event.preventDefault()}
    >
      <Toolbar className="rounded-2xl border border-border/70 bg-background/95 p-1 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/88">
        <ToolbarGroup>
          <MarkToolbarButton
            nodeType="bold"
            tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_BOLD")}
            variant="outline"
          >
            <span className="font-semibold">B</span>
          </MarkToolbarButton>
          <MarkToolbarButton
            nodeType="italic"
            tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_ITALIC")}
            variant="outline"
          >
            <span className="italic">I</span>
          </MarkToolbarButton>
          <MarkToolbarButton
            nodeType="underline"
            tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_UNDERLINE")}
            variant="outline"
          >
            <span className="underline underline-offset-2">U</span>
          </MarkToolbarButton>
          <MarkToolbarButton
            nodeType="strikethrough"
            tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_STRIKETHROUGH")}
            variant="outline"
          >
            <span className="line-through">S</span>
          </MarkToolbarButton>
          <ToolbarSeparator />
          <LinkToolbarButton variant="outline" />
          <MarkToolbarButton
            nodeType="code"
            tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_CODE")}
            variant="outline"
          >
            <span className="font-mono text-[0.82rem]">{"</>"}</span>
          </MarkToolbarButton>
          <MarkToolbarButton
            nodeType="highlight"
            tooltip={t("CONTENT_LIBRARY_EDITOR_MARK_HIGHLIGHT")}
            variant="outline"
          >
            <span className="rounded bg-warning/20 px-1 text-[0.82rem]">H</span>
          </MarkToolbarButton>
        </ToolbarGroup>
      </Toolbar>
    </div>
  );
}
