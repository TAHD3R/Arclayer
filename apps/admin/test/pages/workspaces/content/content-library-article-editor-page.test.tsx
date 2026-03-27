import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ContentLibraryArticleEditorPage } from "@/pages/workspaces/content/library/article-editor/page";
import { ContentLibraryArticleEditorShell } from "@/pages/workspaces/content/library/article-editor/content-library-article-editor-shell";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: (props: { children?: ReactNode }) => (
    <div data-testid="default-page-shell">{props.children}</div>
  ),
}));

describe("content-library-article-editor-page", () => {
  it("renders the page mode shell inside the default page layout", () => {
    render(<ContentLibraryArticleEditorPage workspaceId="ws-1" itemId="content-1" />);

    expect(screen.getByTestId("default-page-shell")).toBeInTheDocument();
    expect(screen.getByLabelText("CONTENT_LIBRARY_EDITOR_DOCUMENT_MENU")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_TITLE_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("CONTENT_LIBRARY_EDITOR_SUMMARY_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(screen.getByText("CONTENT_LIBRARY_EDITOR_BODY_PLACEHOLDER")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR"),
    ).not.toBeInTheDocument();
  });

  it("renders split toolbar actions with tooltips and handlers", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onOpenPage = vi.fn();

    render(
      <ContentLibraryArticleEditorShell
        mode="split"
        title="Test article"
        summary=""
        onTitleChange={vi.fn()}
        onSummaryChange={vi.fn()}
        onClose={onClose}
        onOpenPage={onOpenPage}
      />,
    );

    const closeButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW",
    });
    const maximizeButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR",
    });

    await user.hover(closeButton);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "CONTENT_LIBRARY_ACTION_CLOSE_SIDEBAR_PREVIEW",
      );
    });

    await user.unhover(closeButton);
    await user.hover(maximizeButton);
    await waitFor(() => {
      expect(document.body.querySelector('[data-slot="tooltip-content"]')).toHaveTextContent(
        "CONTENT_LIBRARY_ACTION_OPEN_PAGE_EDITOR",
      );
    });

    await user.click(closeButton);
    await user.click(maximizeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenPage).toHaveBeenCalledTimes(1);
  });
});
