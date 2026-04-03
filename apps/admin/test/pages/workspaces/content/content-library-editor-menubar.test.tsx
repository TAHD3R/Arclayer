import * as React from "react";

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  copyToClipboard: vi.fn(),
  editor: {
    api: {
      markdown: {
        serialize: vi.fn(() => "# Launch memo"),
      },
    },
    undo: vi.fn(),
  },
  exportDialogOpen: false,
  importDialogOpen: false,
  searchDialogOpen: false,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@arclayer/hooks/use-client-platform", () => ({
  useClientPlatform: () => "mac",
}));

vi.mock("platejs/react", () => ({
  useEditorRef: () => mocked.editor,
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: (...args: unknown[]) => mocked.copyToClipboard(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: vi.fn(),
  notifySuccessText: vi.fn(),
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuIconItem: ({
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
  DropdownMenuItem: ({
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
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuRadioItem: ({
    children,
    onClick,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuShortcut: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  DropdownMenuSub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: React.ReactNode;
  }) => {
    if (asChild && React.isValidElement(children)) return children;
    return <button type="button">{children}</button>;
  },
}));

vi.mock("@arclayer/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    children?: React.ReactNode;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props);
    }
    return (
      <button type="button" {...props}>
        {children}
      </button>
    );
  },
}));

vi.mock("@arclayer/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@arclayer/ui/kbd", () => ({
  Kbd: ({ children }: { children?: React.ReactNode }) => <kbd>{children}</kbd>,
  KbdGroup: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-import-dialog",
  () => ({
    ContentLibraryArticleEditorImportDialog: ({
      open,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onImportDocument: (value: Record<string, unknown>) => void;
    }) => (open ? <div>import-dialog-open</div> : null),
  }),
);

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-export-dialog",
  () => ({
    ContentLibraryArticleEditorExportDialog: ({
      open,
    }: {
      defaultFilename: string;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => (open ? <div>export-dialog-open</div> : null),
  }),
);

vi.mock(
  "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-search-dialog",
  () => ({
    ContentLibraryArticleEditorSearchOverlay: ({
      open,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }) => (open ? <div>search-dialog-open</div> : null),
  }),
);

import { ContentLibraryArticleEditorMenuBar } from "@/pages/workspaces/content/library/article-editor/components/content-library-article-editor-menu";

describe("content-library-editor-menubar", () => {
  beforeEach(() => {
    mocked.copyToClipboard.mockReset();
    mocked.editor.api.markdown.serialize.mockClear();
    mocked.editor.undo.mockReset();
  });

  it("shows required document actions and split-only actions", () => {
    const { rerender } = render(
      <ContentLibraryArticleEditorMenuBar
        itemTitle="Launch memo"
        mode="split"
        onCloseSplit={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onImportDocument={vi.fn()}
        onOpenAllUpdates={vi.fn()}
        onOpenPageEditor={vi.fn()}
        onOpenSeo={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-memo"
        status="draft"
        visibility="public"
      />,
    );

    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_SEARCH")).toBeInTheDocument();
    const searchAction = screen.getByRole("button", {
      name: /CONTENT_LIBRARY_EDITOR_MENU_SEARCH/i,
    });
    expect(within(searchAction).getByText("⌘")).toBeInTheDocument();
    expect(within(searchAction).getByText("F")).toBeInTheDocument();
    const undoAction = screen.getByRole("button", {
      name: /CONTENT_LIBRARY_EDITOR_ACTION_UNDO/i,
    });
    expect(within(undoAction).getByText("⌘")).toBeInTheDocument();
    expect(within(undoAction).getByText("Z")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: "CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU_SEARCH_PLACEHOLDER",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_COPY_PAGE_CONTENT")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_IMPORT")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_EXPORT")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_DUPLICATE_PAGE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_VERSION_HISTORY")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_ALL_UPDATES")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")).toBeInTheDocument();

    rerender(
      <ContentLibraryArticleEditorMenuBar
        itemTitle="Launch memo"
        mode="page"
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onImportDocument={vi.fn()}
        onOpenAllUpdates={vi.fn()}
        onOpenSeo={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-memo"
        status="draft"
        visibility="public"
      />,
    );

    expect(
      screen.queryByText("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR")).not.toBeInTheDocument();
  });

  it("copies the current editor markdown through the clipboard helper", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryArticleEditorMenuBar
        itemTitle="Launch memo"
        mode="page"
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onImportDocument={vi.fn()}
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-memo"
        status="draft"
        visibility="public"
      />,
    );

    await user.click(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_COPY_PAGE_CONTENT"));

    expect(mocked.editor.api.markdown.serialize).toHaveBeenCalled();
    expect(mocked.copyToClipboard).toHaveBeenCalledWith("# Launch memo");
  });

  it("opens the search import and export dialogs from the document menu", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryArticleEditorMenuBar
        itemTitle="Launch memo"
        mode="page"
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onImportDocument={vi.fn()}
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-memo"
        status="draft"
        visibility="public"
      />,
    );

    await user.click(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_SEARCH"));
    expect(screen.getByText("search-dialog-open")).toBeInTheDocument();

    await user.click(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_IMPORT"));
    expect(screen.getByText("import-dialog-open")).toBeInTheDocument();

    await user.click(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_EXPORT"));
    expect(screen.getByText("export-dialog-open")).toBeInTheDocument();
  });

  it("filters menu items from the search input", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryArticleEditorMenuBar
        itemTitle="Launch memo"
        mode="page"
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onImportDocument={vi.fn()}
        onOpenAllUpdates={vi.fn()}
        onOpenSeo={vi.fn()}
        onOpenVersionHistory={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-memo"
        status="draft"
        visibility="public"
      />,
    );

    const input = screen.getByRole("textbox", {
      name: "CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU_SEARCH_PLACEHOLDER",
    });

    await user.type(input, "export");

    expect(screen.queryByText("CONTENT_LIBRARY_EDITOR_MENU_SEARCH")).not.toBeInTheDocument();
    expect(
      screen.queryByText("CONTENT_LIBRARY_EDITOR_MENU_COPY_PAGE_CONTENT"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_EXPORT")).toBeInTheDocument();
    expect(
      screen.queryByText("CONTENT_LIBRARY_EDITOR_MENU_DUPLICATE_PAGE"),
    ).not.toBeInTheDocument();
  });

  it("dispatches duplicate and delete through the provided action callbacks", async () => {
    const user = userEvent.setup();
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();

    render(
      <ContentLibraryArticleEditorMenuBar
        itemTitle="Launch memo"
        mode="page"
        onDelete={onDelete}
        onDuplicate={onDuplicate}
        onImportDocument={vi.fn()}
        onOpenSeo={vi.fn()}
        onSlugChange={vi.fn()}
        onVisibilityChange={vi.fn()}
        slug="launch-memo"
        status="draft"
        visibility="public"
      />,
    );

    await user.click(screen.getByText("CONTENT_LIBRARY_EDITOR_MENU_DUPLICATE_PAGE"));
    await user.click(screen.getByText("CONTENT_LIBRARY_ACTION_DELETE"));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
