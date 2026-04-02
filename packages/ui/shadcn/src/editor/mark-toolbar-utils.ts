import type { PlateEditor } from "platejs/react";

export function toggleToolbarMark(
  editor: PlateEditor,
  options: {
    clear?: string[] | string;
    nodeType: string;
  },
) {
  editor.tf.toggleMark(options.nodeType, options.clear ? { remove: options.clear } : undefined);
}
