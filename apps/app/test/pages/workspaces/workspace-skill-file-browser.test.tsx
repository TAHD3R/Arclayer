import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  SkillMarkdownPreview,
  WorkspaceSkillFileBrowser,
} from "@/pages/workspaces/settings/workspace/skills/workspace-skill-file-browser";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count !== undefined ? `${key}:${values.count}` : key,
  }),
}));

const files = [
  {
    path: "SKILL.md",
    role: "instructions",
    mimeType: "text/markdown",
    byteSize: 24,
    content: "# Editorial planning\n\nUse approved evidence.",
  },
  {
    path: "guides/usage.md",
    role: "reference",
    mimeType: "text/markdown",
    byteSize: 13,
    content: "Usage guide",
  },
  {
    path: "reference/api.json",
    role: "reference",
    mimeType: "application/json",
    byteSize: 18,
    content: '{ "key": "value" }',
  },
];

describe("WorkspaceSkillFileBrowser", () => {
  it("defaults to the instructions file with the full file count", () => {
    render(<WorkspaceSkillFileBrowser files={files} />);

    expect(screen.getByText("SKILL.md")).toBeInTheDocument();
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_FILES_COUNT:3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_FILE_SELECT_LABEL" }),
    ).toBeInTheDocument();
  });

  it("groups files into a folder tree and switches previews", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSkillFileBrowser files={files} />);

    await user.click(
      screen.getByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_FILE_SELECT_LABEL" }),
    );

    expect(screen.getByRole("menuitem", { name: /usage\.md/ })).toBeInTheDocument();
    expect(screen.getAllByText("guides").length).toBeGreaterThan(0);
    expect(screen.getAllByText("reference").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("menuitem", { name: /api\.json/ }));

    expect(await screen.findByText('{ "key": "value" }')).toBeInTheDocument();
  });

  it("renders markdown sources through the static markdown preview", () => {
    render(<SkillMarkdownPreview source="# Heading\n\nBody copy" />);
    expect(document.querySelector('[data-slot="plate-static"], .group\\/editor')).not.toBeNull();
  });

  it("shows an explicit empty state when the skill has no files", () => {
    render(<WorkspaceSkillFileBrowser files={[]} />);
    expect(screen.getByText("SETTINGS_WORKSPACE_SKILLS_FILE_EMPTY")).toBeInTheDocument();
  });

  it("marks non-previewable files explicitly", async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceSkillFileBrowser
        files={[
          {
            path: "SKILL.md",
            role: "instructions",
            mimeType: "text/markdown",
            byteSize: 1,
            content: "x",
          },
          { path: "binary.png", role: "asset", mimeType: "image/png", byteSize: 2 },
        ]}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_FILE_SELECT_LABEL" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /binary\.png/ }));
    expect(
      await screen.findByText("SETTINGS_WORKSPACE_SKILLS_FILE_PREVIEW_UNAVAILABLE"),
    ).toBeInTheDocument();
  });

  it("keeps keyboard selection working on file menu items", async () => {
    const user = userEvent.setup();
    render(<WorkspaceSkillFileBrowser files={files} />);
    await user.click(
      screen.getByRole("button", { name: "SETTINGS_WORKSPACE_SKILLS_FILE_SELECT_LABEL" }),
    );
    const item = screen.getByRole("menuitem", { name: /usage\.md/ });
    fireEvent.keyDown(item, { key: "Enter" });
    expect(await screen.findByText("guides/usage.md")).toBeInTheDocument();
  });
});
