import * as React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  applyArticleEditorInsertItem: vi.fn(),
  applyEditorMarkColor: vi.fn(),
  applyTurnInto: vi.fn(),
  clearEditorMarkColor: vi.fn(),
  commands: {
    insertItem: vi.fn(),
    openMediaInsert: vi.fn(),
  },
  editor: {
    tf: {
      toggleMark: vi.fn(),
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("platejs/react", () => ({
  useEditorRef: () => mocked.editor,
  useSelectionFragmentProp: () => "p",
}));

vi.mock("@platejs/list", () => ({
  toggleList: vi.fn(),
}));

vi.mock("@platejs/toggle/react", () => ({
  openNextToggles: vi.fn(),
}));

vi.mock("@arclayer/ui/menubar", () => ({
  Menubar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarIconItem: ({
    children,
    onSelect,
  }: {
    children?: React.ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  MenubarItem: ({ children, onSelect }: { children?: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  MenubarLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarRadioGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarRadioItem: ({
    children,
    value,
    onClick,
  }: {
    children?: React.ReactNode;
    value?: string;
    onClick?: () => void;
  }) => (
    <button type="button" data-value={value} onClick={onClick}>
      {children}
    </button>
  ),
  MenubarSeparator: () => <hr />,
  MenubarShortcut: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  MenubarSub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarSubContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarSubTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  MenubarTrigger: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@arclayer/ui/editor", () => ({
  applyArticleEditorInsertItem: (...args: unknown[]) =>
    mocked.applyArticleEditorInsertItem(...args),
  applyEditorMarkColor: (...args: unknown[]) => mocked.applyEditorMarkColor(...args),
  applyTurnInto: (...args: unknown[]) => mocked.applyTurnInto(...args),
  ARTICLE_EDITOR_INSERT_AUDIO: "audio",
  ARTICLE_EDITOR_INSERT_DIVIDER: "divider",
  ARTICLE_EDITOR_INSERT_FILE: "file",
  ARTICLE_EDITOR_INSERT_IMAGE: "image",
  ARTICLE_EDITOR_INSERT_TOC: "toc",
  ARTICLE_EDITOR_INSERT_VIDEO: "video",
  captureEditorSelection: () => ({ blockSelectionIds: [], selection: null }),
  clearEditorMarkColor: (...args: unknown[]) => mocked.clearEditorMarkColor(...args),
  getEditorColorOptions: () => [
    {
      color: null,
      labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_DEFAULT",
      value: "default",
    },
    {
      color: "#337ea9",
      labelKey: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_BLUE",
      value: "blue",
    },
  ],
  getTurnIntoValue: () => "p",
  runEditorTransformPreservingSelection: (_editor: unknown, fn: () => void) => fn(),
  setBlockType: vi.fn(),
  toggleTodoList: vi.fn(),
  TURN_INTO_MENU_ITEMS: [
    { icon: () => null, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_TEXT", value: "p" },
    { icon: () => null, labelKey: "CONTENT_LIBRARY_EDITOR_INSERT_HEADING_1", value: "h1" },
  ],
  useArticleEditorCommands: () => mocked.commands,
}));

import { ContentLibraryArticleEditorMenuBar } from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-menu";

describe("content-library-editor-menubar", () => {
  beforeEach(() => {
    mocked.applyArticleEditorInsertItem.mockReset();
    mocked.applyEditorMarkColor.mockReset();
    mocked.applyTurnInto.mockReset();
    mocked.clearEditorMarkColor.mockReset();
    mocked.commands.insertItem.mockReset();
    mocked.commands.openMediaInsert.mockReset();
    mocked.editor.tf.toggleMark.mockReset();
  });

  it("shows split-mode actions without leaking them into page mode", () => {
    const { rerender } = render(
      <ContentLibraryArticleEditorMenuBar
        mode="split"
        onCloseSplit={vi.fn()}
        onOpenPageEditor={vi.fn()}
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-note"
        status="draft"
        visibility="public"
      />,
    );

    expect(screen.getByText("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")).toBeInTheDocument();

    rerender(
      <ContentLibraryArticleEditorMenuBar
        mode="page"
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-note"
        status="draft"
        visibility="public"
      />,
    );

    expect(
      screen.queryByText("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")).not.toBeInTheDocument();
  });

  it("dispatches media insert actions through the shared editor command contract", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryArticleEditorMenuBar
        mode="page"
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-note"
        status="draft"
        visibility="public"
      />,
    );

    await user.click(screen.getByText("CONTENT_LIBRARY_EDITOR_INSERT_IMAGE"));

    expect(mocked.commands.openMediaInsert).toHaveBeenCalledWith(mocked.editor, {
      kind: "image",
      source: "upload",
    });
  });

  it("shows shortcut labels for menu items that have real bindings", () => {
    render(
      <ContentLibraryArticleEditorMenuBar
        mode="page"
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-note"
        status="draft"
        visibility="public"
      />,
    );

    expect(screen.getByText("Mod+B")).toBeInTheDocument();
    expect(screen.getAllByText("Mod+Alt+1")).not.toHaveLength(0);
    expect(screen.getByText("Mod+Alt+7")).toBeInTheDocument();
  });
});
