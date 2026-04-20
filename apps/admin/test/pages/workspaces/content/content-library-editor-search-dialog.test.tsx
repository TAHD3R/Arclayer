import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { ContentLibraryArticleEditorSearchOverlay } from "@/pages/projects/content/library/article-editor/components/content-library-article-editor-search-dialog";

function renderSearchDialog() {
  const onOpenChange = vi.fn();

  render(
    <>
      <div data-testid="content-library-article-editor-body">
        <div aria-label="Article body">Hello world. Hello editor. A final hello.</div>
      </div>
      <ContentLibraryArticleEditorSearchOverlay open onOpenChange={onOpenChange} />
    </>,
  );

  return { onOpenChange };
}

describe("content-library-editor-search-dialog", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    class HighlightMock {
      ranges: Range[];

      constructor(...ranges: Range[]) {
        this.ranges = ranges;
      }
    }

    vi.stubGlobal("Highlight", HighlightMock);
    const highlights = {
      set: vi.fn(),
      delete: vi.fn(),
    };
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: {
        highlights,
      },
    });
  });

  it("keeps focus while typing and shows current search counts", async () => {
    const user = userEvent.setup();
    renderSearchDialog();

    expect(screen.getByTestId("article-editor-search-overlay")).toBeInTheDocument();

    const input = screen.getByRole("textbox", { name: "CONTENT_LIBRARY_EDITOR_SEARCH_LABEL" });
    expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("0/0");

    await user.type(input, "hello");

    await waitFor(() => {
      expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("1/3");
    });

    expect(input).toHaveFocus();
  });

  it("syncs all matches and the active match to css highlights", async () => {
    const user = userEvent.setup();
    renderSearchDialog();

    const input = screen.getByRole("textbox", { name: "CONTENT_LIBRARY_EDITOR_SEARCH_LABEL" });
    await user.type(input, "hello");

    await waitFor(() => {
      expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("1/3");
    });

    const cssApi = globalThis.CSS as typeof CSS & {
      highlights: { set: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    };

    expect(cssApi.highlights.set).toHaveBeenCalledWith(
      "article-editor-search-match",
      expect.objectContaining({
        ranges: expect.arrayContaining([expect.any(Range)]),
      }),
    );
    expect(cssApi.highlights.set).toHaveBeenCalledWith(
      "article-editor-search-active-match",
      expect.objectContaining({
        ranges: expect.arrayContaining([expect.any(Range)]),
      }),
    );
  });

  it("enables navigation only when results exist and updates the active index", async () => {
    const user = userEvent.setup();
    renderSearchDialog();

    const input = screen.getByRole("textbox", { name: "CONTENT_LIBRARY_EDITOR_SEARCH_LABEL" });
    const previousButton = screen.getByRole("button", {
      name: "CONTENT_LIBRARY_EDITOR_SEARCH_PREVIOUS",
    });
    const nextButton = screen.getByRole("button", { name: "CONTENT_LIBRARY_EDITOR_SEARCH_NEXT" });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeDisabled();

    await user.type(input, "missing");
    await waitFor(() => {
      expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("0/0");
    });
    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, "hello");

    await waitFor(() => {
      expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("1/3");
    });
    expect(previousButton).toBeEnabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);
    expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("2/3");

    await user.click(previousButton);
    expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("1/3");
  });

  it("uses enter and shift+enter for next and previous navigation", async () => {
    const user = userEvent.setup();
    renderSearchDialog();

    const input = screen.getByRole("textbox", { name: "CONTENT_LIBRARY_EDITOR_SEARCH_LABEL" });
    await user.type(input, "hello");

    await waitFor(() => {
      expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("1/3");
    });

    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("2/3");

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.getByTestId("article-editor-search-status")).toHaveTextContent("1/3");
  });

  it("closes on escape and close button", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderSearchDialog();

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockReset();
    await user.click(screen.getByRole("button", { name: "common:CANCEL" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
