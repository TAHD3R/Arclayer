import { KEYS, type TElement } from "platejs";

type TurnIntoEditor = {
  getType: (value: string) => string;
  tf: { collapse: () => void; toggleBlock: (value: string) => void };
};

export function getTurnIntoValue(block: TElement) {
  if (block.type === KEYS.codeBlock) return KEYS.codeBlock;
  if (block.type === KEYS.toggle) return KEYS.toggle;
  if (block.listStyleType === KEYS.listTodo || typeof block.checked === "boolean") {
    return KEYS.listTodo;
  }
  if (block.listStyleType === KEYS.ul) return KEYS.ul;
  if (block.listStyleType === KEYS.ol) return KEYS.ol;
  return block.type ?? KEYS.p;
}

export type TurnIntoDeps<E extends TurnIntoEditor = TurnIntoEditor> = {
  openNextToggles: (editor: E) => void;
  setBlockType: (editor: E, nextType: string) => void;
  toggleList: (editor: E, options: { listStyleType?: string }) => void;
  toggleTodoList: (editor: E, checked?: boolean) => void;
};

export function applyTurnInto<E extends TurnIntoEditor>(
  editor: E,
  nextType: string,
  currentType: string | null | undefined,
  deps: TurnIntoDeps<E>,
) {
  if (currentType === nextType) return;

  if (currentType === KEYS.codeBlock && nextType !== KEYS.codeBlock) {
    editor.tf.toggleBlock(editor.getType(KEYS.codeBlock));
  }

  if (currentType === KEYS.toggle && nextType !== KEYS.toggle) {
    editor.tf.toggleBlock(KEYS.toggle);
    editor.tf.collapse();
  }

  if (currentType === KEYS.listTodo && nextType !== KEYS.listTodo) {
    deps.toggleTodoList(editor, false);
  }

  if ((currentType === KEYS.ul || currentType === KEYS.ol) && nextType !== currentType) {
    deps.toggleList(editor, { listStyleType: currentType });
  }

  if (nextType === KEYS.codeBlock) {
    editor.tf.toggleBlock(editor.getType(KEYS.codeBlock));
    return;
  }

  if (nextType === KEYS.toggle) {
    deps.openNextToggles(editor);
    editor.tf.toggleBlock(KEYS.toggle);
    editor.tf.collapse();
    return;
  }

  if (nextType === KEYS.listTodo) {
    deps.toggleTodoList(editor, false);
    return;
  }

  if (nextType === KEYS.ul || nextType === KEYS.ol) {
    deps.toggleList(editor, { listStyleType: nextType });
    return;
  }

  deps.setBlockType(editor, nextType);
}
