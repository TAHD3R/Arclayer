import { describe, expect, it } from "vitest";
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
});
