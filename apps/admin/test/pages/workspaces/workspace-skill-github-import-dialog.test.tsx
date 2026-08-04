import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceSkillGitHubImportDialog } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-github-dialog";
import {
  deriveGitHubSkillIdentity,
  githubSkillImportSchema,
} from "@/pages/workspaces/settings/workspace/skills/workspace-skill-github-model";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("WorkspaceSkillGitHubImportDialog", () => {
  it("derives a stable identity and submits a normalized public repository request", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <WorkspaceSkillGitHubImportDialog
        open
        onOpenChange={onOpenChange}
        pending={false}
        onSubmit={onSubmit}
      />,
    );

    const repository = screen.getByLabelText(
      "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL",
    );
    fireEvent.change(repository, { target: { value: "https://github.com/Acme/Site-Planner.git" } });
    fireEvent.blur(repository);
    expect(screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_NAME_LABEL")).toHaveValue(
      "Site Planner",
    );
    expect(
      screen.queryByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_SLUG_LABEL"),
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_SUBPATH_LABEL"),
      { target: { value: "/skills/site-planner/" } },
    );
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL"),
      {
        target: { value: "Plans a sitemap and wireframe." },
      },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB",
      }),
    );

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        repositoryUrl: "https://github.com/Acme/Site-Planner.git",
        requestedRef: "main",
        subpath: "skills/site-planner",
        slug: "site-planner",
        displayName: "Site Planner",
        description: "Plans a sitemap and wireframe.",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses direct placeholders and rejects non-repository URLs", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkspaceSkillGitHubImportDialog
        open
        onOpenChange={vi.fn()}
        pending={false}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByPlaceholderText(
        "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_PLACEHOLDER",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_PLACEHOLDER"),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL"),
      { target: { value: "https://github.com/acme/site-skill/tree/main" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB",
      }),
    );

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_ERROR"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires an exact branch, tag, or commit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <WorkspaceSkillGitHubImportDialog
        open
        onOpenChange={vi.fn()}
        pending={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL"),
      { target: { value: "https://github.com/acme/site-skill" } },
    );
    fireEvent.change(screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_LABEL"), {
      target: { value: "" },
    });
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_DESCRIPTION_LABEL"),
      { target: { value: "Plan a site." } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_GITHUB",
      }),
    );

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_ERROR"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("GitHub Skill import model", () => {
  it("accepts a public repository and rejects credentials or parent traversal", () => {
    expect(deriveGitHubSkillIdentity("https://github.com/acme/brand_voice.git")).toEqual({
      slug: "brand-voice",
      displayName: "Brand Voice",
    });
    expect(
      githubSkillImportSchema.safeParse({
        repositoryUrl: "https://user:token@github.com/acme/skill",
        requestedRef: "main",
        subpath: "../private",
        slug: "skill",
        displayName: "Skill",
        description: "Description",
      }).success,
    ).toBe(false);
  });
});
