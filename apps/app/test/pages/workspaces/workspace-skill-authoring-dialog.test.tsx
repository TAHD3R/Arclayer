import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSkillPackageCreateDialog } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-authoring-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/editor/markdown-plate-editor", () => ({
  MarkdownPlateEditor: (props: {
    ariaLabel: string;
    ariaDescribedBy?: string;
    ariaInvalid?: boolean;
    id?: string;
    onBlur?: () => void;
    onChange: (value: string) => void;
    placeholder: string;
    value: string;
  }) => (
    <textarea
      id={props.id}
      aria-describedby={props.ariaDescribedBy}
      aria-invalid={props.ariaInvalid}
      aria-label={props.ariaLabel}
      onBlur={props.onBlur}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      value={props.value}
    />
  ),
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
    const drawer = screen
      .getByRole("heading", { name: "settings:SETTINGS_WORKSPACE_SKILLS_WRITE_MANUALLY" })
      .closest('[data-slot="drawer-content"]');
    expect(drawer).not.toBeNull();
    expect(drawer).toHaveClass("sm:w-1/2!", "sm:max-w-none!");
    expect(drawer?.querySelector('[data-slot="drawer-header"]')).toHaveClass("max-w-none!");
    expect(drawer?.querySelector('[data-slot="drawer-body"]')).toHaveClass("max-w-none!");
    expect(drawer?.querySelector('[data-slot="drawer-footer"]')).toHaveClass("max-w-none!");
    expect(
      screen.getByPlaceholderText("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_PLACEHOLDER"),
    ).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_NAME_HELP")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_HELP")).toBeInTheDocument();
    expect(
      screen
        .getByLabelText("SETTINGS_WORKSPACE_SKILLS_NAME_LABEL")
        .compareDocumentPosition(screen.getByText("SETTINGS_WORKSPACE_SKILLS_NAME_HELP")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen
        .getByLabelText("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL")
        .compareDocumentPosition(screen.getByText("SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_HELP")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
