import * as React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  activeContentId: "heading-2",
  headingList: [
    { depth: 1, id: "heading-1", path: [0], title: "Overview", type: "h1" },
    { depth: 2, id: "heading-2", path: [1], title: "Details", type: "h2" },
  ],
  onContentClick: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@platejs/toc/react", () => ({
  useTocSideBarState: () => ({
    activeContentId: mocked.activeContentId,
    headingList: mocked.headingList,
    open: true,
  }),
  useTocSideBar: () => ({
    navProps: { "data-testid": "toc-nav" },
    onContentClick: (...args: unknown[]) => mocked.onContentClick(...args),
  }),
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

import { ContentLibraryArticleEditorTocSidebar } from "@/pages/projects/content/library/article-editor/components/content-library-article-editor-toc-sidebar";

describe("content-library-editor-toc-sidebar", () => {
  beforeEach(() => {
    mocked.activeContentId = "heading-2";
    mocked.headingList = [
      { depth: 1, id: "heading-1", path: [0], title: "Overview", type: "h1" },
      { depth: 2, id: "heading-2", path: [1], title: "Details", type: "h2" },
    ];
    mocked.onContentClick.mockReset();
  });

  it("renders page mode items as link-style actions with an active heading marker", async () => {
    const user = userEvent.setup();

    render(<ContentLibraryArticleEditorTocSidebar mode="page" />);

    const activeItem = screen.getByRole("button", { name: "Details" });
    expect(activeItem).toHaveAttribute("aria-current", "location");

    await user.click(screen.getByRole("button", { name: "Overview" }));

    expect(mocked.onContentClick).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "heading-1", title: "Overview" }),
      "smooth",
    );
  });

  it("renders the split mode trigger with the TOC label instead of an icon-only button", () => {
    render(<ContentLibraryArticleEditorTocSidebar mode="split" />);

    expect(
      screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_INSERT_TOC" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("toc-nav")).toBeInTheDocument();
  });

  it("renders the empty state without headings", () => {
    mocked.headingList = [];

    render(<ContentLibraryArticleEditorTocSidebar mode="page" />);

    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_TOC_EMPTY")).toBeInTheDocument();
  });
});
