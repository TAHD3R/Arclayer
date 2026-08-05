import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetsFolderRailRecentSection } from "@/pages/workspaces/assets/components/assets-folder-rail-recent-section";
import type { ResolvedRecentAsset } from "@/lib/assets/assets-recent";

vi.mock("@/hooks/use-admin-date-time-formatter", () => ({
  useAdminDateTimeFormatter: () => ({
    formatDateTime: (value: string | null | undefined) => value ?? "-",
  }),
}));

const RECENT_ASSET: ResolvedRecentAsset = {
  key: "ws-1:asset-1",
  visitedAt: "2026-03-18T00:00:00Z",
  asset: {
    id: "asset-1",
    name: "Homepage cover.png",
    mimeType: "image/png",
    sizeText: "2 MB",
    previewUrl: "https://example.com/cover.png",
    publicUrl: "https://example.com/public/cover.png",
    contentUrl: "https://example.com/private/cover.png",
  },
};

describe("AssetsFolderRailRecentSection", () => {
  it("uses the shared parent-highlight mode for the section menu", async () => {
    const user = userEvent.setup();

    render(
      <AssetsFolderRailRecentSection
        t={(key) => key}
        scope={null}
        foldersLoading={false}
        activeAssetId={null}
        recentAssets={[RECENT_ASSET]}
        onOpenAsset={() => undefined}
        onRemoveRecentAsset={() => undefined}
        onClearRecentAssets={() => undefined}
      />,
    );

    const moreButtons = screen.getAllByRole("button", { name: "common:MORE" });
    await user.click(moreButtons[0]);

    const clearRecentAction = screen.getByRole("menuitem", {
      name: "assets:ASSET_ACTION_CLEAR_RECENT",
    });

    expect(clearRecentAction).toBeInTheDocument();
    expect(clearRecentAction).toHaveClass("data-[highlighted]:text-destructive");
    expect(clearRecentAction).toHaveClass("data-[highlighted]:bg-destructive/10");
  });

  it("renders the empty recent-files guard without illustration media", () => {
    const view = render(
      <AssetsFolderRailRecentSection
        t={(key) => key}
        scope={null}
        foldersLoading={false}
        activeAssetId={null}
        recentAssets={[]}
        onOpenAsset={() => undefined}
        onRemoveRecentAsset={() => undefined}
        onClearRecentAssets={() => undefined}
      />,
    );

    expect(screen.getByText("assets:ASSET_RECENT_EMPTY")).toBeInTheDocument();
    expect(view.container.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument();
    expect(view.container.querySelector('[data-slot="content-guard"]')).toBeNull();
  });

  it("renders file size and last-opened time as stacked meta lines", () => {
    render(
      <AssetsFolderRailRecentSection
        t={(key) => key}
        scope={null}
        foldersLoading={false}
        activeAssetId={null}
        recentAssets={[RECENT_ASSET]}
        onOpenAsset={() => undefined}
        onRemoveRecentAsset={() => undefined}
        onClearRecentAssets={() => undefined}
      />,
    );

    const sizeLine = screen.getByText("2 MB");
    const timeLine = screen.getByText("assets:ASSET_RECENT_LAST_OPENED");
    const metaBlock = sizeLine.parentElement;

    expect(metaBlock).toHaveClass("mt-1", "flex", "flex-col", "items-start");
    expect(sizeLine).toHaveClass("font-semibold", "text-label-primary");
    expect(timeLine).toHaveClass("text-label-primary/62");
  });
});
