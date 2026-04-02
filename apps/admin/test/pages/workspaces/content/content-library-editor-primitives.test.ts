import { describe, expect, it, vi } from "vitest";
import { KEYS } from "platejs";

import {
  ARTICLE_EDITOR_INSERT_LINK,
  ARTICLE_EDITOR_INSERT_TOGGLE,
  filterArticleEditorInsertGroups,
  getArticleEditorInsertGroups,
} from "../../../../../../packages/ui/shadcn/src/editor/article-editor-insert-groups";
import {
  isEditorDocumentHydrated,
  shouldApplyExternalDocumentSync,
} from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-document-sync";
import { resolveLineHeightOptions } from "../../../../../../packages/ui/shadcn/src/editor/line-height-toolbar-button";
import {
  hasSlashInputChild,
  shouldShowParagraphPlaceholder,
} from "../../../../../../packages/ui/shadcn/src/editor/ui/paragraph-placeholder";
import {
  applyTurnInto,
  getTurnIntoValue,
} from "../../../../../../packages/ui/shadcn/src/editor/turn-into-helpers";
import {
  getBlockContextMenuActionIds,
  isArticleEditorBlockSelectable,
} from "../../../../../../packages/ui/shadcn/src/editor/block-menu-helpers";
import { getContentLibraryArticleEditorBodyEditorClass } from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-body-layout";

describe("content-library-editor-primitives", () => {
  it("does not treat a locally echoed document update as an external rehydrate", () => {
    expect(
      shouldApplyExternalDocumentSync({
        appliedDocumentKey: '{"type":"doc","content":[]}',
        externalSerialized: '{"type":"doc","content":[{"type":"p","children":[{"text":"x"}]}]}',
        lastSyncedDocumentKey: '{"type":"doc","content":[{"type":"p","children":[{"text":"x"}]}]}',
      }),
    ).toBe(false);

    expect(
      isEditorDocumentHydrated({
        appliedDocumentKey: '{"type":"doc","content":[]}',
        externalSerialized: '{"type":"doc","content":[{"type":"p","children":[{"text":"x"}]}]}',
        lastSyncedDocumentKey: '{"type":"doc","content":[{"type":"p","children":[{"text":"x"}]}]}',
      }),
    ).toBe(true);
  });

  it("still applies a real external snapshot refresh", () => {
    expect(
      shouldApplyExternalDocumentSync({
        appliedDocumentKey: '{"type":"doc","content":[]}',
        externalSerialized:
          '{"type":"doc","content":[{"type":"p","children":[{"text":"server"}]}]}',
        lastSyncedDocumentKey: '{"type":"doc","content":[]}',
      }),
    ).toBe(true);

    expect(
      isEditorDocumentHydrated({
        appliedDocumentKey: '{"type":"doc","content":[]}',
        externalSerialized:
          '{"type":"doc","content":[{"type":"p","children":[{"text":"server"}]}]}',
        lastSyncedDocumentKey: '{"type":"doc","content":[]}',
      }),
    ).toBe(false);
  });

  it("suppresses the paragraph placeholder while the slash input is active", () => {
    const paragraph = {
      children: [{ children: [{ text: "" }], type: "slash_input" }],
      type: "p",
    };

    expect(hasSlashInputChild(paragraph)).toBe(true);
    expect(
      shouldShowParagraphPlaceholder({
        element: paragraph,
        focused: true,
        selected: true,
      }),
    ).toBe(false);
  });

  it("suppresses the paragraph placeholder for todo list paragraphs", () => {
    expect(
      shouldShowParagraphPlaceholder({
        element: {
          checked: false,
          children: [{ text: "" }],
          listStyleType: "todo",
          type: "p",
        },
        focused: true,
        selected: true,
      }),
    ).toBe(false);
  });

  it("suppresses the paragraph placeholder inside todo list items", () => {
    const editor = {
      api: {
        node: (path: number[]) => {
          if (path.length === 1 && path[0] === 0) {
            return [{ checked: false, children: [{ text: "" }], listStyleType: "todo" }, path];
          }
          return null;
        },
      },
    };

    expect(
      shouldShowParagraphPlaceholder({
        editor: editor as never,
        element: {
          children: [{ text: "" }],
          type: "p",
        },
        focused: true,
        path: [0, 0],
        selected: true,
      }),
    ).toBe(false);
  });

  it("falls back to a stable line-height option set when Plate does not inject values", () => {
    expect(resolveLineHeightOptions(undefined, "1.5")).toEqual(["1", "1.25", "1.5", "2"]);
    expect(resolveLineHeightOptions([], "1.75")).toEqual(["1", "1.25", "1.5", "2", "1.75"]);
    expect(resolveLineHeightOptions(["1", "1.5", "1.5", "2"], "1.5")).toEqual(["1", "1.5", "2"]);
    expect(resolveLineHeightOptions(undefined, " 1.5 ")).toEqual(["1", "1.25", "1.5", "2"]);
  });

  it("separates list inserts into their own group and exposes link in inline inserts", () => {
    const groups = getArticleEditorInsertGroups((key) => key);

    expect(groups.map((group) => group.id)).toEqual([
      "basic",
      "lists",
      "media",
      "advanced",
      "inline",
    ]);
    expect(groups.find((group) => group.id === "lists")?.items.map((item) => item.value)).toEqual([
      KEYS.ul,
      KEYS.ol,
      KEYS.listTodo,
      ARTICLE_EDITOR_INSERT_TOGGLE,
    ]);
    expect(
      groups
        .find((group) => group.id === "inline")
        ?.items.some((item) => item.value === ARTICLE_EDITOR_INSERT_LINK),
    ).toBe(true);
  });

  it("filters insert groups by label, description, and keywords", () => {
    const groups = getArticleEditorInsertGroups((key) => key);

    const filtered = filterArticleEditorInsertGroups(groups, "hyperlink");

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("inline");
    expect(filtered[0]?.items.map((item) => item.value)).toEqual([ARTICLE_EDITOR_INSERT_LINK]);
  });

  it("keeps article editor body geometry on a single horizontal lane", () => {
    expect(getContentLibraryArticleEditorBodyEditorClass("page")).not.toMatch(/-mx|px-/);
    expect(getContentLibraryArticleEditorBodyEditorClass("split")).not.toMatch(/-mx|px-/);
  });

  it("resolves turn-into values for lists, toggles, and code blocks", () => {
    expect(getTurnIntoValue({ children: [{ text: "" }], type: KEYS.p })).toBe(KEYS.p);
    expect(
      getTurnIntoValue({
        children: [{ text: "" }],
        listStyleType: KEYS.ul,
        type: KEYS.p,
      } as never),
    ).toBe(KEYS.ul);
    expect(
      getTurnIntoValue({
        checked: false,
        children: [{ text: "" }],
        listStyleType: KEYS.listTodo,
        type: KEYS.p,
      } as never),
    ).toBe(KEYS.listTodo);
    expect(getTurnIntoValue({ children: [{ text: "" }], type: KEYS.toggle } as never)).toBe(
      KEYS.toggle,
    );
    expect(getTurnIntoValue({ children: [{ text: "" }], type: KEYS.codeBlock } as never)).toBe(
      KEYS.codeBlock,
    );
  });

  it("dispatches turn-into transforms by current and next type", () => {
    const actions: string[] = [];
    const editor = {
      getType: (value: string) => `type:${value}`,
      tf: {
        collapse: () => {
          actions.push("collapse");
        },
        toggleBlock: (value: string) => {
          actions.push(`toggle-block:${value}`);
        },
      },
    };

    const deps = {
      openNextToggles: vi.fn(() => {
        actions.push("open-next-toggles");
      }),
      setBlockType: vi.fn(() => {
        actions.push("set-block-type");
      }),
      toggleList: vi.fn((_: unknown, options: { listStyleType?: string }) => {
        actions.push(`toggle-list:${options.listStyleType}`);
      }),
      toggleTodoList: vi.fn(() => {
        actions.push("toggle-todo");
      }),
    };

    applyTurnInto(editor as never, KEYS.ul, KEYS.codeBlock, deps);
    expect(actions).toEqual([`toggle-block:type:${KEYS.codeBlock}`, `toggle-list:${KEYS.ul}`]);

    actions.length = 0;
    applyTurnInto(editor as never, KEYS.toggle, KEYS.ul, deps);
    expect(actions).toEqual([
      `toggle-list:${KEYS.ul}`,
      "open-next-toggles",
      `toggle-block:${KEYS.toggle}`,
      "collapse",
    ]);
  });

  it("limits block selection to supported block types", () => {
    expect(
      isArticleEditorBlockSelectable({
        id: "paragraph-1",
        type: KEYS.p,
      }),
    ).toBe(true);
    expect(
      isArticleEditorBlockSelectable({
        id: "column-1",
        type: KEYS.column,
      }),
    ).toBe(false);
    expect(
      isArticleEditorBlockSelectable({
        id: "row-1",
        type: KEYS.tr,
      }),
    ).toBe(false);
    expect(
      isArticleEditorBlockSelectable({
        id: "cell-1",
        type: KEYS.td,
      }),
    ).toBe(false);
  });

  it("shows turn-into only for single-block context menus", () => {
    expect(getBlockContextMenuActionIds(0)).toEqual([]);
    expect(getBlockContextMenuActionIds(1)).toEqual(["turn-into", "duplicate", "delete"]);
    expect(getBlockContextMenuActionIds(2)).toEqual(["duplicate", "delete"]);
  });
});
