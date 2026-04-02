"use client";

import * as React from "react";

import { useEditorRef, useMarkToolbarButtonState } from "platejs/react";

import { toggleToolbarMark } from "../mark-toolbar-utils";
import { runEditorTransformPreservingSelection } from "../transforms";
import { ToolbarButton, ToolbarTooltip } from "./toolbar";

export function MarkToolbarButton({
  clear,
  nodeType,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType: string;
  clear?: string[] | string;
}) {
  const editor = useEditorRef();
  const state = useMarkToolbarButtonState({ clear, nodeType });

  return (
    <ToolbarTooltip tooltip={props.tooltip}>
      <ToolbarButton
        {...props}
        tooltip={undefined}
        pressed={state.pressed}
        onMouseDown={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => {
            toggleToolbarMark(editor, { clear, nodeType });
          });
        }}
      />
    </ToolbarTooltip>
  );
}
