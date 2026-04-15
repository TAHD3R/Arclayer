import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAssetDetail } from "@/api/assets";
import { UpdateAssetDialog } from "@/pages/workspaces/assets/components/update-asset-dialog";
import { useWorkspaceStore } from "@/stores/use-workspace-store";
import type { AssetMasonryItem } from "@/types/assets-masonry";
import { TooltipProvider } from "@arclayer/ui/tooltip";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === "assets:ASSET_EDIT_DESC" && params?.name) {
        return `${key}:${String(params.name)}`;
      }
      return key;
    },
  }),
}));

vi.mock("@/api/assets", () => ({
  getAssetDetail: vi.fn(),
  patchAsset: vi.fn(),
  moveAsset: vi.fn(),
}));

const mockedGetAssetDetail = vi.mocked(getAssetDetail);

const asset: AssetMasonryItem = {
  id: "asset-1",
  name: "hero.png",
  ext: "png",
  mimeType: "image/png",
  aspectRatio: 1.5,
};

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("UpdateAssetDialog", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ currentWorkspaceId: "ws-1", lastWorkspaceId: "ws-1" });
    mockedGetAssetDetail.mockResolvedValue({
      id: "asset-1",
      originalFilename: "hero.png",
      folderId: null,
      altName: "",
    } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("opens the alt name tooltip on hover but not on focus", async () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <UpdateAssetDialog open onOpenChange={vi.fn()} asset={asset} folders={[]} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    const trigger = screen.getByLabelText("assets:ASSET_EDIT_ALT_NAME_TOOLTIP");

    await waitFor(() => {
      expect(trigger).not.toBeDisabled();
    });

    fireEvent.focus(trigger);

    expect(screen.queryByText("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")).toBeNull();

    fireEvent.mouseEnter(trigger);

    expect(await screen.findByText("assets:ASSET_EDIT_ALT_NAME_TOOLTIP")).toBeInTheDocument();
    expect(trigger.closest(".text-headline")).not.toBeNull();
  });

  it("renders a plain confirm button without a leading icon", async () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <UpdateAssetDialog open onOpenChange={vi.fn()} asset={asset} folders={[]} />
        </TooltipProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "common:CONFIRM" })).toBeEnabled();
    });

    expect(screen.getByText("assets:ASSET_EDIT_ALT_NAME_HELP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common:CONFIRM" }).querySelector("svg")).toBeNull();
  });
});
