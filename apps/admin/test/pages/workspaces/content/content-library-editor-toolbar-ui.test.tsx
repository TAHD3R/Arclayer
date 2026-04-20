import * as React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openMediaInsert: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("platejs/react", () => ({
  useEditorRef: () => ({
    api: {
      isExpanded: () => false,
      mark: () => "#FF0000",
      marks: () => ({ fontSize: "16px" }),
      some: () => false,
      block: () => [{ type: "p" }, [0]],
    },
    getTransforms: () => ({
      lineHeight: {
        setNodes: vi.fn(),
      },
    }),
    history: {
      redos: [],
      undos: [],
    },
    redo: vi.fn(),
    selection: null,
    tf: {
      focus: vi.fn(),
    },
    undo: vi.fn(),
  }),
  useEditorSelector: (selector: (editor: any) => unknown) =>
    selector({
      api: {
        isExpanded: () => false,
        mark: () => "#FF0000",
        marks: () => ({ fontSize: "16px" }),
        some: () => false,
        block: () => [{ type: "p" }, [0]],
      },
      history: {
        redos: [],
        undos: [],
      },
      selection: null,
    }),
  useSelectionFragmentProp: () => "p",
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
  buttonVariants: () => "",
}));

vi.mock("@radix-ui/react-toolbar", () => ({
  Button: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  Root: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToggleItem: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ToolbarToggleGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@arclayer/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
    <div data-testid="dropdown-content" className={className}>
      {children}
    </div>
  ),
  DropdownMenuIconItem: ({
    children,
    onSelect,
  }: {
    children?: React.ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={() =>
        onSelect?.({
          preventDefault: () => undefined,
        })
      }
    >
      {children}
    </button>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children?: React.ReactNode;
    onSelect?: (event: { preventDefault: () => void }) => void;
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={() =>
        onSelect?.({
          preventDefault: () => undefined,
        })
      }
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({
    asChild,
    children,
  }: {
    asChild?: boolean;
    children?: React.ReactNode;
  }) => {
    if (asChild && React.isValidElement(children)) {
      return children;
    }

    return <button type="button">{children}</button>;
  },
}));

vi.mock("@arclayer/ui/popover", () => ({
  Popover: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({
    children,
    className,
  }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
    <div data-testid="popover-content" className={className}>
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@arclayer/ui/editor", () => ({
  AlignToolbarButton: () => <button type="button">align</button>,
  applyArticleEditorInsertItem: vi.fn(),
  ArticleEditorInsertMenuContent: () => <div />,
  FontColorToolbarButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  FontSizeToolbarButton: () => <button type="button">font-size</button>,
  getArticleEditorInsertGroups: () => [],
  getBlockType: () => "p",
  InlineEquationToolbarButton: () => <button type="button">equation</button>,
  insertTodoList: vi.fn(),
  LineHeightToolbarButton: () => <button type="button">line-height</button>,
  LinkToolbarButton: () => <button type="button">link</button>,
  MarkToolbarButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  MoreToolbarButton: () => <button type="button">more</button>,
  TableToolbarButton: () => <button type="button">table</button>,
  Toolbar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToolbarButton: ({
    children,
    pressed: _pressed,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode;
    pressed?: boolean;
  }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ToolbarGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToolbarSplitButton: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  ToolbarSplitButtonPrimary: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  ToolbarSplitButtonSecondary: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode },
  ) => <button type="button" {...props} />,
  ToolbarTooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  TurnIntoToolbarButton: () => <button type="button">turn-into</button>,
  useArticleEditorCommands: () => ({
    insertItem: vi.fn(),
    openMediaInsert: (...args: unknown[]) => mocks.openMediaInsert(...args),
  }),
}));

vi.mock(
  "@/pages/projects/content/library/article-editor/components/content-library-article-editor-menu",
  () => ({
    ContentLibraryArticleEditorMenuBar: () => (
      <button type="button" aria-label="CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU">
        CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU
      </button>
    ),
  }),
);

vi.mock(
  "@/pages/projects/content/library/article-editor/components/content-library-article-editor-save-indicator",
  () => ({
    ContentLibraryArticleEditorSaveIndicator: () => null,
  }),
);

vi.mock("../../../../../../packages/ui/src/editor/transforms", () => ({
  captureEditorSelection: () => ({ anchor: [0], focus: [0] }),
  runEditorTransformPreservingSelection: (_editor: unknown, fn: () => void, _options: unknown) =>
    fn(),
}));

import { ContentLibraryArticleEditorPageToolbar } from "@/pages/projects/content/library/article-editor/components/content-library-article-editor-page-toolbar";
import { FontColorToolbarButton } from "../../../../../../packages/ui/src/editor/font-color-toolbar-button";

describe("content-library-editor-toolbar-ui", () => {
  beforeEach(() => {
    mocks.openMediaInsert.mockReset();
  });

  it("renders add block as a single dropdown trigger while keeping media insertion as split buttons", async () => {
    render(
      <ContentLibraryArticleEditorPageToolbar
        hasPublishableVersion
        itemTitle="Launch memo"
        isPublishing={false}
        onImportDocument={vi.fn()}
        onPublish={vi.fn()}
        onVisibilityChange={vi.fn()}
        saveState="saved"
        slug="launch-note"
        status="draft"
        visibility="public"
        onSlugChange={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_EDITOR_INSERT_TRIGGER" }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "CONTENT_LIBRARY_EDITOR_INSERT_IMAGE" }),
    ).toHaveLength(2);
  });

  it("uses a split button for media insertion so the primary button uploads immediately", async () => {
    const user = userEvent.setup();

    render(
      <ContentLibraryArticleEditorPageToolbar
        hasPublishableVersion
        itemTitle="Launch memo"
        isPublishing={false}
        onImportDocument={vi.fn()}
        onPublish={vi.fn()}
        onVisibilityChange={vi.fn()}
        saveState="saved"
        slug="launch-note"
        status="draft"
        visibility="public"
        onSlugChange={vi.fn()}
      />,
    );

    const imageButtons = screen.getAllByRole("button", {
      name: "CONTENT_LIBRARY_EDITOR_INSERT_IMAGE",
    });

    expect(imageButtons).toHaveLength(2);

    await user.click(imageButtons[0]);

    expect(mocks.openMediaInsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "image",
        source: "upload",
      }),
    );
  });

  it("renders the document menu after the publish button", () => {
    render(
      <ContentLibraryArticleEditorPageToolbar
        hasPublishableVersion
        itemTitle="Launch memo"
        isPublishing={false}
        onImportDocument={vi.fn()}
        onPublish={vi.fn()}
        onVisibilityChange={vi.fn()}
        saveState="saved"
        slug="launch-note"
        status="draft"
        visibility="public"
        onSlugChange={vi.fn()}
      />,
    );

    const publishButton = screen.getByRole("button", { name: "CONTENT_LIBRARY_ACTION_PUBLISH" });
    const documentMenuButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU",
    });

    expect(
      publishButton.compareDocumentPosition(documentMenuButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("replaces the native color input with the compact custom picker", () => {
    render(
      <FontColorToolbarButton nodeType="color" tooltip="CONTENT_LIBRARY_EDITOR_MARK_TEXT_COLOR">
        T
      </FontColorToolbarButton>,
    );

    expect(screen.getByTestId("dropdown-content").className).toContain("min-w-[14rem]");
    expect(
      screen.getByRole("menuitem", { name: "CONTENT_LIBRARY_EDITOR_COLOR_NAME_GRAY" }),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_COLOR_CUSTOM")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "CONTENT_LIBRARY_EDITOR_COLOR_VALUE" }),
    ).toBeInTheDocument();
    expect(document.querySelector('input[type="color"]')).not.toBeNull();
  });
});
