import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetsFolderRailFolderSection } from "@/pages/workspaces/assets/components/assets-folder-rail-folder-section";
import type { AdminAssetFolder } from "@/types/api";

const ROOT_FOLDER: AdminAssetFolder = {
  id: "folder-1",
  name: "Campaign",
  description: "Homepage launch assets",
  createdAt: "2026-03-18T00:00:00Z",
};

describe("AssetsFolderRailFolderSection", () => {
  it("shows a single empty-state card plus a create-folder action when there are no folders", () => {
    render(
      <AssetsFolderRailFolderSection
        t={(key) => key}
        folders={[]}
        foldersLoading={false}
        foldersError={false}
        currentFolderId={null}
        onRetryFolders={vi.fn()}
        onSelectFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onEditFolder={vi.fn()}
        onMoveFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
      />,
    );

    expect(screen.getByText("assets:ASSET_FOLDER_PANEL_EMPTY")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "assets:ASSET_ACTION_CREATE_FOLDER" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("assets:ASSET_FOLDER_ADD_CARD_TITLE")).not.toBeInTheDocument();
  });

  it("renders rectangular folder items in single-column mode", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <AssetsFolderRailFolderSection
        t={(key) => key}
        folders={[ROOT_FOLDER]}
        foldersLoading={false}
        foldersError={false}
        currentFolderId={null}
        onRetryFolders={vi.fn()}
        onSelectFolder={vi.fn()}
        onCreateFolder={vi.fn()}
        onEditFolder={vi.fn()}
        onMoveFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "common:MORE" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "assets:ASSET_FOLDER_LAYOUT_SINGLE" }),
    );

    const folderCard = container.querySelector('[data-folder-card="folder-1"]');
    const addCard = container.querySelector('[data-folder-card="add-folder"]');

    expect(folderCard).toHaveAttribute("data-layout-mode", "single");
    expect(folderCard).not.toHaveClass("aspect-square");
    expect(addCard).toHaveAttribute("data-layout-mode", "single");
    expect(addCard).not.toHaveClass("aspect-square");
  });
});
