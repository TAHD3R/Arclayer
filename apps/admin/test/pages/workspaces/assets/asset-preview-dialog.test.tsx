import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetPreviewDialog } from "@/pages/workspaces/assets/components/asset-preview-dialog";
import type { AssetMasonryItem } from "@/types/assets-masonry";

vi.mock("@/pages/workspaces/assets/components/asset-preview-dialog-controller", () => ({
  useAssetPreviewDialogController: () => ({
    active: {
      id: "asset-1",
      name: "hero.png",
      ext: "png",
      mimeType: "image/png",
      aspectRatio: 1.2,
    },
    t: (key: string) => key,
    publicAbsoluteUrl: "https://cdn.example.com/hero.png",
    activeAspectRatio: 1.2,
    previewAspectRatio: 1.2,
    setPreviewAspectRatio: vi.fn(),
    previewSrc: "https://cdn.example.com/hero.png",
    setPreviewSrc: vi.fn(),
    previewCandidates: [],
    failedPreviewRef: { current: new Set<string>() },
    editAccessOpen: false,
    setEditAccessOpen: vi.fn(),
    deleteOpen: false,
    setDeleteOpen: vi.fn(),
    deleteMutation: {
      isPending: false,
      mutate: vi.fn(),
    },
    patchAccessMutation: {
      isPending: false,
      mutateAsync: vi.fn(),
    },
    displayVisibility: "public",
    displayPurpose: "library",
    uploaderAndTimeText: "Philip Cole · 2026-04-15",
  }),
}));

vi.mock("@/pages/workspaces/assets/components/asset-preview-stage", () => ({
  AssetPreviewStage: () => <div>stage</div>,
}));

vi.mock("@/pages/workspaces/assets/components/asset-preview-sidebar", () => ({
  AssetPreviewSidebar: () => <div>sidebar</div>,
}));

vi.mock("@/pages/workspaces/assets/components/update-assets-access-dialog", () => ({
  UpdateAssetsAccessDialog: () => null,
}));

const asset: AssetMasonryItem = {
  id: "asset-1",
  name: "hero.png",
  ext: "png",
  mimeType: "image/png",
  aspectRatio: 1.2,
};

describe("AssetPreviewDialog", () => {
  it("shows the more-actions dropdown above the preview dialog layer", async () => {
    const user = userEvent.setup();

    render(
      <AssetPreviewDialog
        projectId="project-1"
        active={asset}
        onClose={vi.fn()}
        items={[asset]}
        onSelectAsset={vi.fn()}
        currentFolderPathLabel="Root"
        folderBreadcrumbs={["Campaigns", "May"]}
        projectBreadcrumb={{ name: "Brand site" }}
        onOpenEditAsset={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "common:MORE" }));

    expect(await screen.findByText("assets:ASSET_ACTION_EDIT")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dropdown-menu-content"]')).toHaveClass("z-[2400]");
  });

  it("renders a left-aligned headline title on a muted header", () => {
    render(
      <AssetPreviewDialog
        projectId="project-1"
        active={asset}
        onClose={vi.fn()}
        items={[asset]}
        onSelectAsset={vi.fn()}
        currentFolderPathLabel="Root"
        folderBreadcrumbs={["Campaigns", "May"]}
        projectBreadcrumb={{ name: "Brand site" }}
        onOpenEditAsset={vi.fn()}
      />,
    );

    const title = screen.getByRole("heading", { name: "hero.png" });
    expect(title).toHaveClass("text-callout");
    expect(title.closest(".bg-muted")).not.toBeNull();
    expect(title.closest(".items-center")).not.toBeNull();
    expect(screen.getByText("Brand site")).toBeInTheDocument();
    expect(screen.getByText("Campaigns")).toBeInTheDocument();
    expect(screen.getByText("May")).toBeInTheDocument();
    expect(screen.queryByText("Philip Cole · 2026-04-15")).not.toBeInTheDocument();
  });

  it("renders the preview stage as the full body with a floating sidebar", () => {
    render(
      <AssetPreviewDialog
        projectId="project-1"
        active={asset}
        onClose={vi.fn()}
        items={[asset]}
        onSelectAsset={vi.fn()}
        currentFolderPathLabel="Root"
        folderBreadcrumbs={["Campaigns", "May"]}
        projectBreadcrumb={{ name: "Brand site" }}
        onOpenEditAsset={vi.fn()}
      />,
    );

    expect(screen.getByTestId("asset-preview-stage-region")).toHaveClass(
      "absolute",
      "p-6",
      "sm:right-[25rem]",
      "lg:p-8",
    );
    expect(screen.getByTestId("asset-preview-floating-sidebar")).toHaveClass(
      "absolute",
      "z-10",
      "sm:w-[24rem]",
    );
  });

  it("disables preview write actions in read-only asset mode", async () => {
    const user = userEvent.setup();

    render(
      <AssetPreviewDialog
        projectId="project-1"
        active={asset}
        onClose={vi.fn()}
        items={[asset]}
        onSelectAsset={vi.fn()}
        currentFolderPathLabel="Root"
        folderBreadcrumbs={["Campaigns", "May"]}
        projectBreadcrumb={{ name: "Brand site" }}
        onOpenEditAsset={vi.fn()}
        canManageAssets={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "common:MORE" }));

    expect(
      (await screen.findByText("assets:ASSET_ACTION_EDIT")).closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("assets:ASSET_ACTION_EDIT_ACCESS").closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("assets:ASSET_ACTION_DELETE").closest('[role="menuitem"]'),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText("assets:ASSET_ACTION_COPY_LINK").closest('[role="menuitem"]'),
    ).not.toHaveAttribute("aria-disabled");
  });
});
