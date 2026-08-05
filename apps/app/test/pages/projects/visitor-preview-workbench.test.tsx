import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VisitorPreviewWorkbench } from "@/pages/projects/editor/visitor-preview-workbench";
import { siteRenderDocumentFixture } from "../../fixtures/site-render-document";

const getRenderDocumentMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/api/project-builder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/project-builder")>();
  return {
    ...actual,
    getProjectBuilderPageRenderDocument: (...args: unknown[]) => getRenderDocumentMock(...args),
  };
});

function renderWorkbench() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <VisitorPreviewWorkbench
        open
        onOpenChange={vi.fn()}
        projectId="project-1"
        projectName="Northstar"
        revisionId="revision-1"
        revisionNumber={2}
        pageItemId="home-page"
        pageTitle="Home"
        availableLocales={["en-US", "zh-CN"]}
      />
    </QueryClientProvider>,
  );
}

describe("VisitorPreviewWorkbench", () => {
  beforeEach(() => {
    getRenderDocumentMock.mockReset().mockResolvedValue(siteRenderDocumentFixture());
  });

  it("renders the exact revision document on a responsive read-only site plane", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    expect(await screen.findByRole("heading", { name: "Build the next Northstar" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start building" })).toBeDisabled();
    expect(screen.getByText("light")).toBeVisible();
    expect(screen.getByText("CREATION_EDITOR_PREVIEW_REVISION")).toBeVisible();
    expect(getRenderDocumentMock).toHaveBeenCalledWith(
      "project-1",
      "revision-1",
      "home-page",
      "en-US",
      null,
      expect.any(AbortSignal),
    );

    await user.click(
      screen.getByRole("button", { name: "CREATION_EDITOR_PREVIEW_VIEWPORT_MOBILE" }),
    );
    expect(screen.getByTestId("visitor-preview-plane")).toHaveAttribute("data-viewport", "mobile");
  });

  it("shows product copy for renderer request errors and retries the real query", async () => {
    const user = userEvent.setup();
    getRenderDocumentMock.mockRejectedValueOnce(new Error("Pinned render document failed"));
    renderWorkbench();

    expect(await screen.findByText("CREATION_EDITOR_PREVIEW_ERROR_DESC")).toBeVisible();
    expect(screen.queryByText("Pinned render document failed")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "CREATION_EDITOR_RETRY" }));

    await waitFor(() => expect(getRenderDocumentMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("heading", { name: "Build the next Northstar" })).toBeVisible();
  });
});
