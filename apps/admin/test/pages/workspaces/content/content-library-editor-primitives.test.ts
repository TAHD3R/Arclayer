import { describe, expect, it, vi } from "vitest";
import { KEYS } from "platejs";

vi.mock("katex/dist/katex.min.css", () => ({}));
vi.mock("@platejs/math", () => ({
  insertEquation: vi.fn(),
  insertInlineEquation: vi.fn(),
}));

import {
  ARTICLE_EDITOR_INSERT_EMOJI,
  ARTICLE_EDITOR_INSERT_LINK,
  ARTICLE_EDITOR_INSERT_TOGGLE,
  filterArticleEditorInsertGroups,
  getArticleEditorInsertGroups,
} from "../../../../../../packages/ui/shadcn/src/editor/article-editor-insert-groups";
import {
  insertArticleEditorTable,
  insertHorizontalRule,
  insertToggleBlock,
} from "../../../../../../packages/ui/shadcn/src/editor/article-editor-insert-items";
import {
  isEditorDocumentHydrated,
  shouldApplyExternalDocumentSync,
} from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-document-sync";
import { resolveLineHeightOptions } from "../../../../../../packages/ui/shadcn/src/editor/line-height-toolbar-button";
import {
  hasSlashInputChild,
  shouldShowParagraphPlaceholder,
} from "../../../../../../packages/ui/shadcn/src/editor/ui/paragraph-placeholder";
import { buildSlashCommandGroups } from "../../../../../../packages/ui/shadcn/src/editor/ui/slash-node";
import {
  captureEditorSelection,
  restoreEditorSelection,
} from "../../../../../../packages/ui/shadcn/src/editor/transforms";
import { toggleToolbarMark } from "../../../../../../packages/ui/shadcn/src/editor/mark-toolbar-utils";
import {
  applyTurnInto,
  getTurnIntoValue,
} from "../../../../../../packages/ui/shadcn/src/editor/turn-into-helpers";
import {
  isArticleEditorBlockSelectableAtPath,
  getBlockContextMenuActionIds,
  isArticleEditorBlockSelectable,
} from "../../../../../../packages/ui/shadcn/src/editor/block-menu-helpers";
import {
  clearEditorMarkColorForBlocks,
  getEditorMarkColorValue,
  getEditorMarkValueForBlocks,
  setEditorMarkColorForBlocks,
} from "../../../../../../packages/ui/shadcn/src/editor/mark-color-utils";
import { getContentLibraryArticleEditorBodyEditorClass } from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-body-layout";
import { exitEmptyToggle } from "../../../../../../packages/ui/shadcn/src/editor/toggle-plugin-helpers";
import {
  getDateKeyInTimeZone,
  zonedDateKeyToIso,
} from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-date-localization";

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

  it("suppresses the paragraph placeholder while an expanded text selection exists", () => {
    const editor = {
      getOption: () => false,
      selection: {
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 1, path: [0, 0] },
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
        selected: true,
      }),
    ).toBe(false);
  });

  it("suppresses the paragraph placeholder while block selection is active", () => {
    const editor = {
      api: {
        isExpanded: () => false,
      },
      getOption: (_plugin: unknown, key: string) => key === "isSelectingSome",
    };

    expect(
      shouldShowParagraphPlaceholder({
        editor: editor as never,
        element: {
          children: [{ text: "" }],
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

  it("shows the paragraph placeholder for the current empty paragraph only", () => {
    const editor = {
      api: {
        block: () => [
          {
            children: [{ text: "" }],
            type: "p",
          },
          [1],
        ],
      },
      selection: {
        anchor: { offset: 0, path: [1, 0] },
        focus: { offset: 0, path: [1, 0] },
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
        path: [1],
        selected: true,
      }),
    ).toBe(true);

    expect(
      shouldShowParagraphPlaceholder({
        editor: editor as never,
        element: {
          children: [{ text: "" }],
          type: "p",
        },
        focused: true,
        path: [0],
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

  it("captures and restores block selection ids alongside editor selection", () => {
    const set = vi.fn();
    const focus = vi.fn();
    const select = vi.fn();
    const editor = {
      getApi: () => ({
        blockSelection: {
          focus,
          set,
        },
      }),
      getOption: (_plugin: unknown, key: string) =>
        key === "selectedIds" ? new Set(["block-1", "block-2"]) : undefined,
      selection: null,
      tf: {
        focus: vi.fn(),
        select,
      },
    };

    const snapshot = captureEditorSelection(editor as never);

    expect(snapshot).toEqual({
      blockSelectionIds: ["block-1", "block-2"],
      selection: null,
    });

    restoreEditorSelection(editor as never, snapshot);

    expect(set).toHaveBeenCalledWith(["block-1", "block-2"]);
    expect(focus).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });

  it("toggles toolbar marks through the single-mark transform pipeline", () => {
    const toggleMark = vi.fn();
    const editor = {
      tf: {
        toggleMark,
      },
    };

    toggleToolbarMark(editor as never, {
      clear: [KEYS.italic],
      nodeType: KEYS.bold,
    });

    expect(toggleMark).toHaveBeenCalledWith(KEYS.bold, { remove: [KEYS.italic] });
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
    expect(
      groups
        .find((group) => group.id === "inline")
        ?.items.some((item) => item.value === ARTICLE_EDITOR_INSERT_EMOJI),
    ).toBe(true);
  });

  it("builds slash commands with searchable top-level turn-into, action, and color groups", () => {
    const groups = buildSlashCommandGroups({
      currentBackgroundColor: "rgba(204, 0, 0, 0.24)",
      currentTextColor: "#3c78d8",
      currentTurnIntoValue: KEYS.h2,
      t: (key) => key,
    });

    expect(groups.map((group) => group.id)).toEqual([
      "basic",
      "lists",
      "media",
      "advanced",
      "inline",
      "turn-into",
      "actions",
      "text-color",
      "background-color",
    ]);

    expect(
      groups
        .find((group) => group.id === "turn-into")
        ?.items.some((item) => item.value === KEYS.h2),
    ).toBe(true);
    expect(groups.find((group) => group.id === "actions")?.items.map((item) => item.value)).toEqual(
      ["duplicate", "delete"],
    );

    const textColorItems = groups.find((group) => group.id === "text-color")?.items ?? [];
    expect(textColorItems.some((item) => item.value === "text:#3c78d8")).toBe(true);
    expect(textColorItems.some((item) => item.value === "text:clear")).toBe(true);

    const backgroundItems = groups.find((group) => group.id === "background-color")?.items ?? [];
    expect(backgroundItems.some((item) => item.value === "background:#cc0000")).toBe(true);
    expect(backgroundItems.some((item) => item.value === "background:clear")).toBe(true);
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

  it("disables block selection for paragraphs inside table rows", () => {
    const editor = {
      api: {
        block: vi.fn(() => [{ id: "row-1", type: KEYS.tr }, [1]]),
      },
      getType: vi.fn((value: string) => value),
    };

    expect(
      isArticleEditorBlockSelectableAtPath(
        editor as never,
        {
          id: "paragraph-1",
          type: KEYS.p,
        },
        [1, 0, 0],
      ),
    ).toBe(false);
  });

  it("shows turn-into only for single-block context menus", () => {
    expect(getBlockContextMenuActionIds(0)).toEqual([]);
    expect(getBlockContextMenuActionIds(1)).toEqual(["turn-into", "duplicate", "delete"]);
    expect(getBlockContextMenuActionIds(2)).toEqual(["duplicate", "delete"]);
  });

  it("stores background mark colors as translucent highlight values", () => {
    expect(getEditorMarkColorValue(KEYS.color, "#f1c232")).toBe("#f1c232");
    expect(getEditorMarkColorValue(KEYS.backgroundColor, "#f1c232")).toBe(
      "rgba(241, 194, 50, 0.24)",
    );
  });

  it("reads a shared mark color only when all selected block text leaves agree", () => {
    const sharedBlocks = [
      [
        {
          children: [{ color: "#1155cc", text: "Alpha" }],
          type: KEYS.p,
        },
        [0],
      ],
      [
        {
          children: [{ children: [{ color: "#1155cc", text: "Beta" }], type: KEYS.link }],
          type: KEYS.p,
        },
        [1],
      ],
    ] as never;

    expect(getEditorMarkValueForBlocks(sharedBlocks, KEYS.color)).toBe("#1155cc");

    const mixedBlocks = [
      sharedBlocks[0],
      [
        {
          children: [{ color: "#cc0000", text: "Gamma" }],
          type: KEYS.p,
        },
        [2],
      ],
    ] as never;

    expect(getEditorMarkValueForBlocks(mixedBlocks, KEYS.color)).toBeNull();
  });

  it("applies and clears mark colors across every text leaf in selected blocks", () => {
    const setNodes = vi.fn();
    const unsetNodes = vi.fn();
    const editor = {
      tf: {
        setNodes,
        unsetNodes,
        withoutNormalizing: (fn: () => void) => fn(),
      },
    };

    const blocks = [
      [
        {
          children: [
            { text: "Alpha" },
            {
              children: [{ text: "Beta" }],
              type: KEYS.link,
            },
          ],
          type: KEYS.p,
        },
        [0],
      ],
      [
        {
          children: [{ text: "Gamma" }],
          type: KEYS.blockquote,
        },
        [1],
      ],
    ] as never;

    setEditorMarkColorForBlocks(editor as never, KEYS.backgroundColor, "#f1c232", blocks);

    expect(setNodes).toHaveBeenNthCalledWith(
      1,
      { [KEYS.backgroundColor]: "rgba(241, 194, 50, 0.24)" },
      { at: [0, 0] },
    );
    expect(setNodes).toHaveBeenNthCalledWith(
      2,
      { [KEYS.backgroundColor]: "rgba(241, 194, 50, 0.24)" },
      { at: [0, 1, 0] },
    );
    expect(setNodes).toHaveBeenNthCalledWith(
      3,
      { [KEYS.backgroundColor]: "rgba(241, 194, 50, 0.24)" },
      { at: [1, 0] },
    );

    clearEditorMarkColorForBlocks(editor as never, KEYS.backgroundColor, blocks);

    expect(unsetNodes).toHaveBeenNthCalledWith(1, KEYS.backgroundColor, { at: [0, 0] });
    expect(unsetNodes).toHaveBeenNthCalledWith(2, KEYS.backgroundColor, { at: [0, 1, 0] });
    expect(unsetNodes).toHaveBeenNthCalledWith(3, KEYS.backgroundColor, { at: [1, 0] });
  });

  it("round-trips workspace date keys through timezone-aware ISO storage", () => {
    const shanghaiIso = zonedDateKeyToIso("2026-02-03", "Asia/Shanghai");
    const losAngelesIso = zonedDateKeyToIso("2026-02-03", "America/Los_Angeles");

    expect(shanghaiIso).toBeTruthy();
    expect(getDateKeyInTimeZone(new Date(String(shanghaiIso)), "Asia/Shanghai")).toBe("2026-02-03");
    expect(losAngelesIso).toBeTruthy();
    expect(getDateKeyInTimeZone(new Date(String(losAngelesIso)), "America/Los_Angeles")).toBe(
      "2026-02-03",
    );
  });

  it("inserts a trailing paragraph after a horizontal rule at the document end", () => {
    const insertBlockMock = vi.fn();
    const insertNodes = vi.fn();
    const editor = {
      api: {
        block: vi.fn(() => [{ id: "hr-1", type: KEYS.hr }, [1]]),
        create: {
          block: vi.fn(() => ({ type: KEYS.p })),
        },
        node: vi.fn(() => null),
      },
      tf: {
        insertNodes,
      },
    };

    insertHorizontalRule(editor as never, { insertBlock: insertBlockMock as never });

    expect(insertNodes).toHaveBeenCalledWith({ type: KEYS.p }, { at: [2], select: true });
  });

  it("inserts a trailing paragraph after a table at the document end", () => {
    const insertNodes = vi.fn();
    const editor = {
      api: {
        above: vi.fn(() => [{ id: "table-1", type: KEYS.table }, [3]]),
        create: {
          block: vi.fn(() => ({ type: KEYS.p })),
        },
        node: vi.fn(() => null),
      },
      getType: vi.fn((value: string) => value),
      tf: {
        insertNodes,
      },
    };

    insertArticleEditorTable(editor as never, { insertTable: vi.fn() as never });

    expect(insertNodes).toHaveBeenCalledWith({ type: KEYS.p }, { at: [4], select: true });
  });

  it("inserts a toggle block from the next empty paragraph when the current block has content", () => {
    const select = vi.fn();
    const insertNodes = vi.fn();
    const toggleBlock = vi.fn();
    const collapse = vi.fn();
    const toggleIds = vi.fn();
    const editor = {
      api: {
        block: vi
          .fn()
          .mockReturnValueOnce([{ id: "p-1", type: KEYS.p, children: [{ text: "hello" }] }, [0]])
          .mockReturnValueOnce([{ id: "toggle-1", type: KEYS.toggle }, [1]]),
        isEmpty: vi.fn(() => false),
        start: vi.fn(() => ({ offset: 0, path: [1, 0] })),
        create: {
          block: vi.fn(() => ({ type: KEYS.p })),
        },
      },
      getApi: vi.fn(() => ({
        toggle: {
          toggleIds,
        },
      })),
      getType: vi.fn((value: string) => value),
      tf: {
        collapse,
        insertNodes,
        select,
        toggleBlock,
        withoutNormalizing: (fn: () => void) => fn(),
      },
    };

    insertToggleBlock(editor as never, { openNextToggles: vi.fn() as never });

    expect(insertNodes).toHaveBeenCalledWith({ type: KEYS.p }, { at: [1], select: true });
    expect(select).toHaveBeenCalledWith({ offset: 0, path: [1, 0] });
    expect(toggleBlock).toHaveBeenCalledWith(KEYS.toggle);
    expect(collapse).toHaveBeenCalledOnce();
    expect(toggleIds).toHaveBeenCalledWith(["toggle-1"], true);
  });

  it("exits an empty toggle by resetting it to a paragraph and reducing indent", () => {
    const focus = vi.fn();
    const collapse = vi.fn();
    const setNodes = vi.fn();
    const toggleIds = vi.fn();
    const editor = {
      api: {
        block: vi.fn(() => [
          { id: "toggle-1", indent: 2, type: KEYS.toggle, children: [{ text: "" }] },
          [2],
        ]),
        isEmpty: vi.fn(() => true),
      },
      getApi: vi.fn(() => ({
        toggle: {
          toggleIds,
        },
      })),
      getType: vi.fn((value: string) => value),
      tf: {
        collapse,
        focus,
        setNodes,
        unsetNodes: vi.fn(),
        withoutNormalizing: (fn: () => void) => fn(),
      },
    };

    expect(exitEmptyToggle(editor as never)).toBe(true);
    expect(setNodes).toHaveBeenNthCalledWith(1, { type: KEYS.p }, { at: [2] });
    expect(setNodes).toHaveBeenNthCalledWith(2, { indent: 1 }, { at: [2] });
    expect(toggleIds).toHaveBeenCalledWith(["toggle-1"], false);
    expect(collapse).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();
  });
});
