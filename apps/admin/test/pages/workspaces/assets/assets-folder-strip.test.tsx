import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { AssetsFolderStrip } from "@/pages/workspaces/assets/components/assets-folder-strip";
import type { AdminAssetFolder } from "@arclayer/openapi/admin-types";

const ROOT_FOLDER: AdminAssetFolder = {
  id: "folder-1",
  name: "Campaign",
  description: "Launch assets",
  createdAt: "2026-04-27T00:00:00Z",
};

const CHILD_FOLDER: AdminAssetFolder = {
  id: "folder-2",
  parentId: "folder-1",
  name: "Hero",
  description: null,
  createdAt: "2026-04-27T00:00:00Z",
};

function renderStrip(overrides: Partial<ComponentProps<typeof AssetsFolderStrip>> = {}) {
  const props: ComponentProps<typeof AssetsFolderStrip> = {
    t: (key) => key,
    folders: [ROOT_FOLDER, CHILD_FOLDER],
    folderEntries: [{ kind: "folder", folder: ROOT_FOLDER }],
    foldersLoading: false,
    foldersError: false,
    assetLibraryHasContent: true,
    currentFolderId: null,
    onRetryFolders: vi.fn(),
    onSelectFolder: vi.fn(),
    onEditFolder: vi.fn(),
    onMoveFolder: vi.fn(),
    onDeleteFolder: vi.fn(),
    dropSuccessPulse: null,
    tooltipDisabled: false,
    canManageAssets: true,
    ...overrides,
  };

  return {
    ...render(<AssetsFolderStrip {...props} />),
    props,
  };
}

describe("AssetsFolderStrip", () => {
  it("keeps the existing empty-assets state when the library has no content", () => {
    const { container } = render(
      <AssetsFolderStrip
        t={(key) => key}
        folders={[ROOT_FOLDER]}
        folderEntries={[{ kind: "folder", folder: ROOT_FOLDER }]}
        foldersLoading={false}
        foldersError={false}
        assetLibraryHasContent={false}
        currentFolderId={null}
        onRetryFolders={vi.fn()}
        onSelectFolder={vi.fn()}
        onEditFolder={vi.fn()}
        onMoveFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders folder cards when the library has folders without assets", () => {
    renderStrip({
      assetLibraryHasContent: true,
      folderEntries: [{ kind: "folder", folder: ROOT_FOLDER }],
    });

    expect(screen.getByText("Campaign")).toBeInTheDocument();
  });

  it("renders folder cards in a horizontally scrollable row when folders exist", () => {
    const { container } = renderStrip();

    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("Campaign")).toHaveClass("truncate");
    expect(screen.getByText("Launch assets")).toHaveClass("truncate", "line-clamp-1");
    expect(container.querySelector("section")).toHaveClass("shrink-0");
    expect(container.querySelector("section")).not.toHaveClass("border-b");
    expect(container.querySelector(".overflow-x-auto")).toHaveClass("pb-4", "pt-1", "px-1");
    expect(container.querySelector(".w-\\[12rem\\]")).toBeInTheDocument();
  });

  it("adds the parent-folder card first while inside a folder", async () => {
    const user = userEvent.setup();
    const onSelectFolder = vi.fn();

    renderStrip({
      currentFolderId: "folder-2",
      folderEntries: [{ kind: "folderUp" }],
      onSelectFolder,
    });

    await user.click(screen.getByText("assets:ASSET_FOLDER_UP"));

    expect(onSelectFolder).toHaveBeenCalledWith("folder-1");
  });
});
