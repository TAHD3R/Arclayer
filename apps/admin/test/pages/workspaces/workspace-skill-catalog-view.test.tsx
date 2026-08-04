import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSkillCatalogView } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-catalog-view";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const archivePackage = {
  createdAt: "2026-08-04T00:00:00Z",
  createdByUserId: "user-1",
  description: "Imported from a reviewed ZIP archive.",
  displayName: "ZIP editorial review",
  id: "package-zip",
  latestValidVersionId: "version-1",
  metadataRevision: 1,
  publisherId: "workspace:workspace-1",
  publisherName: "Workspace",
  slug: "zip-editorial-review",
  sourceKind: "archive",
  status: "active",
  trustLevel: "imported_unverified",
  updatedAt: "2026-08-04T00:00:00Z",
  updatedByUserId: "user-1",
  versionCount: 1,
  workspaceId: "workspace-1",
};

describe("WorkspaceSkillCatalogView", () => {
  it("labels ZIP sources in the keyboard-selectable list", () => {
    const onSelect = vi.fn();
    render(
      <WorkspaceSkillCatalogView
        installations={[]}
        onSelect={onSelect}
        packages={[archivePackage]}
      />,
    );

    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_SOURCE_ARCHIVE")).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /ZIP editorial review/ });
    fireEvent.keyDown(row, { key: "Enter" });

    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_SOURCE_ARCHIVE")).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith("package-zip");
  });
});
