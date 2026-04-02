import { insertCallout } from "@platejs/callout";
import { insertEmptyCodeBlock } from "@platejs/code-block";
import { insertDate } from "@platejs/date";
import { insertColumnGroup } from "@platejs/layout";
import { insertEquation, insertInlineEquation } from "@platejs/math";
import { insertToc } from "@platejs/toc";
import { indentTodo, outdentList, someTodoList, toggleList } from "@platejs/list";
import { insertTable } from "@platejs/table";
import { KEYS, PathApi } from "platejs";
import type { PlateEditor } from "platejs/react";

import {
  ARTICLE_EDITOR_INSERT_CALLOUT,
  ARTICLE_EDITOR_INSERT_DATE,
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

  if (value === ARTICLE_EDITOR_INSERT_TABLE) {
    insertTable(editor, { colCount: 3, header: true, rowCount: 3 });
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
