import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssetsFolderRailFolderSection } from "@/pages/workspaces/assets/components/assets-folder-rail-folder-section";
import type { AdminAssetFolder } from "@/types/api";

const ROOT_FOLDER: AdminAssetFolder = {
  id: "folder-1",
  name: "Campaign",
  description:
    "Homepage launch assets with rollout notes and workspace guardrails for the launch team.",
  createdAt: "2026-03-18T00:00:00Z",
};

describe("AssetsFolderRailFolderSection", () => {
  it("shows the add-folder card instead of the empty state when there are no folders", async () => {
    const user = userEvent.setup();
    const onCreateFolder = vi.fn();

    render(
      <AssetsFolderRailFolderSection
        t={(key) => key}
        folders={[]}
        foldersLoading={false}
        foldersError={false}
        currentFolderId={null}
        onRetryFolders={vi.fn()}
        onSelectFolder={vi.fn()}
        onCreateFolder={onCreateFolder}
        onEditFolder={vi.fn()}
        onMoveFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
      />,
    );

    const addCard = screen.getByRole("button", { name: /assets:ASSET_FOLDER_ADD_CARD_TITLE/i });

    expect(addCard).toBeInTheDocument();
    expect(screen.queryByText("assets:ASSET_FOLDER_PANEL_EMPTY")).not.toBeInTheDocument();

    await user.click(addCard);

    expect(onCreateFolder).toHaveBeenCalledWith(null);
  });

  it("defaults to single-column folder cards and keeps the manual layout switch", async () => {
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

    const folderCard = container.querySelector('[data-folder-card="folder-1"]');
    const addCard = container.querySelector('[data-folder-card="add-folder"]');

    expect(folderCard).toHaveAttribute("data-layout-mode", "single");
    expect(folderCard).not.toHaveClass("aspect-square");
    expect(addCard).toHaveAttribute("data-layout-mode", "single");
    expect(addCard).not.toHaveClass("aspect-square");

    await user.click(screen.getByRole("button", { name: "common:MORE" }));
    await user.click(
      screen.getByRole("menuitemradio", { name: "assets:ASSET_FOLDER_LAYOUT_MULTI" }),
    );

    expect(folderCard).toHaveAttribute("data-layout-mode", "multi");
    expect(folderCard).toHaveClass("min-h-[10.75rem]");
    expect(addCard).toHaveAttribute("data-layout-mode", "multi");
    expect(addCard).toHaveClass("min-h-[10.75rem]");
  });

  it("keeps multi-column folder cards readable with clamped title and description", async () => {
    const user = userEvent.setup();
    const folderDescription = ROOT_FOLDER.description;

    render(
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
      screen.getByRole("menuitemradio", { name: "assets:ASSET_FOLDER_LAYOUT_MULTI" }),
    );

    expect(screen.getByText("Campaign")).toHaveClass("line-clamp-3");
    expect(screen.getByText("assets:ASSET_FOLDER_ADD_CARD_TITLE")).toHaveClass("line-clamp-3");
    expect(folderDescription).toBeTruthy();
    expect(screen.getByText(folderDescription!)).toHaveClass("line-clamp-3");
  });
});
