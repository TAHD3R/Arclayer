import { insertCallout } from "@platejs/callout";
import { insertEmptyCodeBlock } from "@platejs/code-block";
import { insertDate } from "@platejs/date";
import { insertColumnGroup } from "@platejs/layout";
import { insertEquation, insertInlineEquation } from "@platejs/math";
import { TogglePlugin, openNextToggles } from "@platejs/toggle/react";
import { insertToc } from "@platejs/toc";
import { indentTodo, outdentList, someTodoList, toggleList } from "@platejs/list";
import { insertTable } from "@platejs/table";
import { KEYS, PathApi } from "platejs";
import type { PlateEditor } from "platejs/react";

import {
  ARTICLE_EDITOR_INSERT_CALLOUT,
  ARTICLE_EDITOR_INSERT_DATE,
  ARTICLE_EDITOR_INSERT_EMOJI,
  ARTICLE_EDITOR_INSERT_EQUATION,
  ARTICLE_EDITOR_INSERT_INLINE_EQUATION,
  ARTICLE_EDITOR_INSERT_TABLE,
  ARTICLE_EDITOR_INSERT_THREE_COLUMNS,
  ARTICLE_EDITOR_INSERT_TOC,
} from "./article-editor-insert-groups";
import { insertBlock } from "./transforms";
export * from "./article-editor-insert-groups";

type TodoListEditor = Parameters<typeof indentTodo>[0] & {
  getType: (key: string) => string;
  tf: {
    setNodes: (
      props: { checked: boolean; listStyleType: string },
      options: { match: { type: string } },
    ) => void;
  };
};

export function toggleTodoList(editor: TodoListEditor, checked = false) {
  if (someTodoList(editor)) {
    outdentList(editor, { listStyleType: KEYS.listTodo });
    return;
  }

  indentTodo(editor, { listStyleType: KEYS.listTodo });
  editor.tf.setNodes(
    {
      checked,
      listStyleType: KEYS.listTodo,
    },
    {
      match: { type: editor.getType(KEYS.p) },
    },
  );
}

export function insertTodoList(editor: PlateEditor, checked = false) {
  if (editor.api.isExpanded()) {
    toggleTodoList(editor as TodoListEditor, checked);
    return;
  }

  const block = editor.api.block();
  if (!block) {
    toggleTodoList(editor as TodoListEditor, checked);
    return;
  }

  const [currentNode, path] = block;

  editor.tf.withoutNormalizing(() => {
    if (!editor.api.isEmpty(currentNode)) {
      editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
        at: PathApi.next(path),
        select: true,
      });
    } else {
      const start = editor.api.start(path);
      if (start) {
        editor.tf.select(start);
      }
    }

    toggleTodoList(editor as TodoListEditor, checked);
  });
}

function ensureTrailingParagraph(
  editor: PlateEditor,
  path: number[],
  options: {
    select?: boolean;
  } = {},
) {
  const nextPath = PathApi.next(path);
  if (editor.api.node(nextPath)) return;

  editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
    at: nextPath,
    select: options.select,
  });
}

export function insertHorizontalRule(
  editor: PlateEditor,
  deps: {
    insertBlock?: typeof insertBlock;
  } = {},
) {
  (deps.insertBlock ?? insertBlock)(editor, KEYS.hr);

  const insertedBlock = editor.api.block();
  if (!insertedBlock) return;

  ensureTrailingParagraph(editor, insertedBlock[1], { select: true });
}

export function insertArticleEditorTable(
  editor: PlateEditor,
  deps: {
    insertTable?: typeof insertTable;
  } = {},
) {
  (deps.insertTable ?? insertTable)(editor, { colCount: 3, header: true, rowCount: 3 });

  const tableEntry = editor.api.above({ match: { type: editor.getType(KEYS.table) } });
  if (!tableEntry) return;

  ensureTrailingParagraph(editor, tableEntry[1], { select: true });
}

export function insertToggleBlock(
  editor: PlateEditor,
  deps: {
    openNextToggles?: typeof openNextToggles;
  } = {},
) {
  const currentBlockEntry = editor.api.block();
  if (!currentBlockEntry) return;

  const [currentBlock, currentPath] = currentBlockEntry;

  editor.tf.withoutNormalizing(() => {
    let targetPath = currentPath;

    if (!editor.api.isEmpty(currentBlock)) {
      targetPath = PathApi.next(currentPath);
      editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
        at: targetPath,
        select: true,
      });
    }

    const start = editor.api.start(targetPath);
    if (start) {
      editor.tf.select(start);
    }

    (deps.openNextToggles ?? openNextToggles)(editor);
    editor.tf.toggleBlock(KEYS.toggle);
    editor.tf.collapse();

    const toggleEntry = editor.api.block();
    const toggleId =
      toggleEntry && toggleEntry[0].type === editor.getType(KEYS.toggle)
        ? String(toggleEntry[0].id ?? "")
        : "";

    if (toggleId) {
      editor.getApi(TogglePlugin).toggle.toggleIds([toggleId], true);
    }
  });
}

export function applyArticleEditorInsertItem(editor: PlateEditor, value: string) {
  if (value === KEYS.ul || value === KEYS.ol) {
    toggleList(editor, { listStyleType: value });
    return;
  }

  if (value === KEYS.listTodo) {
    insertTodoList(editor, false);
    return;
  }

  if (value === KEYS.codeBlock) {
    insertEmptyCodeBlock(editor, {
      defaultType: KEYS.p,
      insertNodesOptions: { select: true },
    });
    return;
  }

  if (value === KEYS.hr) {
    insertHorizontalRule(editor);
    return;
  }

  if (value === KEYS.toggle) {
    insertToggleBlock(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_TABLE) {
    insertArticleEditorTable(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_TOC) {
    insertToc(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_CALLOUT) {
    insertCallout(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_DATE) {
    insertDate(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_EMOJI) {
    editor.tf.insertText(":");
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_EQUATION) {
    insertEquation(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_INLINE_EQUATION) {
    insertInlineEquation(editor);
    return;
  }

  if (value === ARTICLE_EDITOR_INSERT_THREE_COLUMNS) {
    insertColumnGroup(editor, { columns: 3, select: true });
    return;
  }

  insertBlock(editor, value, { upsert: true });
}
