import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetsSelectionToolbar } from "@/pages/workspaces/assets/components/assets-view-overlays";

vi.mock("@/pages/workspaces/assets/components/asset-preview-dialog", () => ({
  AssetPreviewDialog: () => null,
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("AssetsViewOverlays", () => {
  it("在选中资源时应渲染为底部居中的浮动 toolbar", () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <div className="relative flex min-h-full min-w-0 w-full flex-col">
          <AssetsSelectionToolbar
            t={(key) => key}
            selectedCount={1}
            bulkMovePending={false}
            bulkUpdatePending={false}
            bulkDeletePending={false}
            onClearSelection={() => undefined}
            onOpenMove={() => undefined}
            onOpenEditAccess={() => undefined}
            onOpenBulkDelete={() => undefined}
          />
        </div>
      </QueryClientProvider>,
    );

    const toolbar = screen
      .getByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" })
      .closest("[data-slot='floating-bulk-toolbar']");
    const surface = toolbar?.querySelector("[data-slot='floating-toolbar']");
    const groups = toolbar?.querySelectorAll("[data-slot='floating-toolbar-group']");

    expect(screen.getByText("assets:ASSET_SELECTED_COUNT")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "assets:ASSET_CLEAR_SELECTION" }),
    ).toBeInTheDocument();
    expect(toolbar).toHaveClass("fixed", "inset-x-0", "justify-center");
    expect(surface).toHaveClass("rounded-full", "border", "px-2.5", "py-1.5");
    expect(groups?.[0]).toHaveClass("pl-1.5");
    expect(groups?.[1]).toHaveClass("pr-1.5");
  });

  it("disables bulk write actions in read-only asset mode", () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AssetsSelectionToolbar
          t={(key) => key}
          selectedCount={1}
          bulkMovePending={false}
          bulkUpdatePending={false}
          bulkDeletePending={false}
          onClearSelection={() => undefined}
          onOpenMove={() => undefined}
          onOpenEditAccess={() => undefined}
          onOpenBulkDelete={() => undefined}
          canManageAssets={false}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "assets:ASSET_ACTION_MOVE" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "assets:ASSET_ACTION_EDIT_ACCESS" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "assets:ASSET_ACTION_DELETE_SELECTED" }),
    ).toBeDisabled();
  });
});
