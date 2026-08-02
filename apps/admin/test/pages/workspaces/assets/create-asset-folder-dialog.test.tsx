import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { CreateAssetFolderDialog } from "@/pages/workspaces/assets/components/create-asset-folder-dialog";
import { DEFAULT_LOCALE, initI18n, i18n } from "@/lib/i18n";
import type { AdminAssetFolderOut as AdminAssetFolder } from "@arclayer/openapi";

const FOLDERS: AdminAssetFolder[] = [
  {
    id: "folder-1",
    name: "Campaign",
    description: "Launch assets",
    createdAt: "2026-03-18T00:00:00Z",
  },
  {
    id: "folder-2",
    parentId: "folder-1",
    name: "Hero",
    description: "Hero images",
    createdAt: "2026-03-18T00:00:00Z",
  },
];

describe("CreateAssetFolderDialog", () => {
  beforeAll(async () => {
    await initI18n(DEFAULT_LOCALE);
  });

  it("uses the initial parent folder as the default creation location", () => {
    render(
      <CreateAssetFolderDialog
        open
        onOpenChange={vi.fn()}
        folders={FOLDERS}
        initialParentId="folder-2"
        parentLabel="Hero"
        onCreate={vi.fn()}
      />,
    );

    expect(
      screen.getByText(i18n.t("assets:ASSET_FOLDER_CREATE_DESC_IN", { parent: "Hero" })),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Campaign / Hero");
  });

  it("submits the selected parent folder in the create payload", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();

    render(
      <CreateAssetFolderDialog
        open
        onOpenChange={vi.fn()}
        folders={FOLDERS}
        initialParentId={null}
        onCreate={onCreate}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(i18n.t("assets:ASSET_FOLDER_CREATE_PLACEHOLDER")),
      "Gallery",
    );
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Campaign / Hero" }));
    await user.click(
      screen.getByRole("button", { name: i18n.t("assets:ASSET_FOLDER_CREATE_CONFIRM") }),
    );

    expect(onCreate).toHaveBeenCalledWith({
      name: "Gallery",
      description: null,
      parentId: "folder-2",
    });
  });
});
