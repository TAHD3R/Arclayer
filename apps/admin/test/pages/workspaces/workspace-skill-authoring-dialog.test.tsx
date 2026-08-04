import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSkillPackageCreateDialog } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-authoring-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceSkillPackageCreateDialog", () => {
  it("creates a manual Skill from the three product fields and derives the slug", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkspaceSkillPackageCreateDialog
        open
        onOpenChange={vi.fn()}
        pending={false}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByPlaceholderText("SETTINGS_WORKSPACE_SKILLS_NAME_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_WORKSPACE_SKILLS_ADVANCED_TITLE"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_WORKSPACE_SKILLS_REFERENCES_LABEL"),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("SETTINGS_WORKSPACE_SKILLS_NAME_LABEL"), {
      target: { value: "Editorial Planner" },
    });
    fireEvent.change(screen.getByLabelText("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL"), {
      target: { value: "Plans evidence-led articles." },
    });
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_INSTRUCTIONS_LABEL"),
      { target: { value: "Use approved evidence and return a structured outline." } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "settings:SETTINGS_WORKSPACE_SKILLS_CREATE_ACTION" }),
    );

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        displayName: "Editorial Planner",
        slug: "editorial-planner",
        description: "Plans evidence-led articles.",
        instructions: "Use approved evidence and return a structured outline.",
        semanticVersion: null,
        capabilityTags: [],
        references: [],
        requiredTools: [],
        permissions: [],
        dataEgress: [],
      }),
    );
  });
});
