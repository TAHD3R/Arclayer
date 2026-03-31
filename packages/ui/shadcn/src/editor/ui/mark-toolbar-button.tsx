"use client";

import * as React from "react";

import { useEditorRef, useMarkToolbarButtonState } from "platejs/react";

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

  const removeMarks = React.useCallback(
    (marks: string[] | string | undefined) => {
      if (!marks) return;
      for (const mark of Array.isArray(marks) ? marks : [marks]) {
        editor.tf.removeMarks(mark);
      }
    },
    [editor],
  );

  return (
    <ToolbarTooltip tooltip={props.tooltip}>
      <ToolbarButton
        {...props}
        tooltip={undefined}
        pressed={state.pressed}
        onMouseDown={(event) => {
          event.preventDefault();
          runEditorTransformPreservingSelection(editor, () => {
            if (state.pressed) {
              editor.tf.removeMarks(nodeType);
              return;
            }

            removeMarks(clear);
            editor.tf.addMarks({ [nodeType]: true });
          });
        }}
      />
    </ToolbarTooltip>
  );
}
