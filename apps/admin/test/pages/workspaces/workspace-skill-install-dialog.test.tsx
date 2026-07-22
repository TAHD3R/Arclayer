import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSkillInstallDialog } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-install-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const validation = {
  id: "validation-1",
  versionId: "version-1",
  workspaceId: "workspace-1",
  policyVersion: 1,
  status: "valid",
  findings: [],
  findingHash: `sha256:${"c".repeat(64)}`,
  actorUserId: "user-1",
  createdAt: "2026-07-20T00:01:00Z",
};

function versionWithDeclarations() {
  return {
    id: "version-1",
    packageId: "package-1",
    workspaceId: "workspace-1",
    versionNumber: 1,
    semanticVersion: "1.0.0",
    packageChecksum: `sha256:${"a".repeat(64)}`,
    status: "valid",
    validationPolicyVersion: 1,
    createdByUserId: "user-1",
    createdAt: "2026-07-20T00:00:00Z",
    manifest: {
      skillId: "workspace.editorial-planner",
      name: "Editorial Planner",
      description: "Plan content.",
      publisher: { id: "workspace:workspace-1", name: "Workspace", verified: false },
      instructionsEntrypoint: "SKILL.md",
      resources: [],
      checksum: `sha256:${"a".repeat(64)}`,
      requiredTools: [
        {
          toolId: "human.request_input",
          versionRange: ">=1",
          intendedUse: "Ask for missing context.",
        },
      ],
      permissions: [{ action: "content.read", purpose: "Read approved content." }],
      dataEgress: [
        {
          destination: "api.example.com",
          purpose: "Send aggregates.",
          dataClasses: ["analytics.aggregate"],
        },
      ],
    },
    resources: [],
    sourceProvenance: { kind: "inline" },
  };
}

describe("WorkspaceSkillInstallDialog", () => {
  it("requires explicit acceptance of every declaration and submits exact identities", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkspaceSkillInstallDialog
        open
        onOpenChange={vi.fn()}
        pending={false}
        packageScope="workspace"
        version={versionWithDeclarations()}
        validation={validation}
        onSubmit={onSubmit}
      />,
    );

    const install = screen.getByRole("button", {
      name: "settings:SETTINGS_WORKSPACE_SKILLS_INSTALL_ACTION",
    });
    expect(install).toBeDisabled();
    for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
    expect(install).toBeEnabled();
    fireEvent.click(install);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        packageScope: "workspace",
        packageId: "package-1",
        versionId: "version-1",
        expectedPackageChecksum: `sha256:${"a".repeat(64)}`,
        validationFindingHash: `sha256:${"c".repeat(64)}`,
        acceptedRequiredTools: ["human.request_input"],
        acceptedPermissions: ["content.read"],
        acceptedDataEgress: ["api.example.com"],
      }),
    );
  });
});
