import { TogglePlugin } from "@platejs/toggle/react";
import { KEYS } from "platejs";
import type { PlateEditor } from "platejs/react";

function getToggleIndent(element: unknown) {
  if (!element || typeof element !== "object") return 0;
  if (!("indent" in element)) return 0;

  return typeof element.indent === "number" ? element.indent : 0;
}

export function exitEmptyToggle(editor: PlateEditor) {
  const currentBlockEntry = editor.api.block();
  if (!currentBlockEntry) return false;

  const [currentBlock, path] = currentBlockEntry;
  if (currentBlock.type !== editor.getType(KEYS.toggle)) return false;
  if (!editor.api.isEmpty(currentBlock)) return false;

  const currentIndent = getToggleIndent(currentBlock);

  editor.tf.withoutNormalizing(() => {
    editor.tf.setNodes({ type: editor.getType(KEYS.p) }, { at: path });

    if (currentIndent > 0) {
      editor.tf.setNodes({ indent: currentIndent - 1 }, { at: path });
    } else {
      editor.tf.unsetNodes(KEYS.indent, { at: path });
    }

    if (currentBlock.id) {
      editor.getApi(TogglePlugin).toggle.toggleIds([String(currentBlock.id)], false);
    }

    editor.tf.collapse();
    editor.tf.focus();
  });

  return true;
}
