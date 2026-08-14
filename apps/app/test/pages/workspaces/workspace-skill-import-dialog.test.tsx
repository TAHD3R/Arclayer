import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@arclayer/ui/tooltip";
import { ChromeTabsProvider } from "@arclayer/ui/chrome-tabs";

import { WorkspaceSkillImportDialog } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-import-dialog";
import { githubSkillImportSchema } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-github-model";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderDialog(initialMode: "github" | "zip" = "github") {
  const onGitHubSubmit = vi.fn().mockResolvedValue(undefined);
  const onZipSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <ChromeTabsProvider
      labels={{ scrollLeftAriaLabel: "scroll left", scrollRightAriaLabel: "scroll right" }}
      userReducedMotion
    >
      <TooltipProvider>
        <WorkspaceSkillImportDialog
          githubPending={false}
          initialMode={initialMode}
          onGitHubSubmit={onGitHubSubmit}
          onOpenChange={onOpenChange}
          onZipSubmit={onZipSubmit}
          open
          zipPending={false}
        />
      </TooltipProvider>
    </ChromeTabsProvider>,
  );
  return { onGitHubSubmit, onOpenChange, onZipSubmit };
}

describe("WorkspaceSkillImportDialog", () => {
  it("places the full-width import tabs directly after the dialog description", () => {
    renderDialog();

    const description = screen.getByText("settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_DIALOG_DESC");
    const tablist = screen.getByRole("tablist", {
      name: "settings:SETTINGS_WORKSPACE_SKILLS_IMPORT_MODE_LABEL",
    });
    const repository = screen.getByLabelText(
      "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL",
    );

    expect(
      description.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      tablist.compareDocumentPosition(repository) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(tablist).toHaveClass("w-full");
    for (const tab of screen.getAllByRole("tab")) expect(tab).toHaveClass("flex-1");
    expect(screen.getByRole("dialog")).toHaveClass("h-[min(44rem,calc(100dvh-2rem))]");
  });

  it("submits only the public repository URL and leaves package discovery to the server", async () => {
    const { onGitHubSubmit, onOpenChange } = renderDialog();
    const repository = screen.getByLabelText(
      "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL",
    );

    fireEvent.change(repository, { target: { value: "https://github.com/Acme/Site-Planner.git" } });
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_ACTION",
      }),
    );

    await waitFor(() =>
      expect(onGitHubSubmit).toHaveBeenCalledWith({
        repositoryUrl: "https://github.com/Acme/Site-Planner.git",
      }),
    );
    expect(
      screen.queryByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_NAME_LABEL"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REF_LABEL"),
    ).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("switches to ZIP import inside the same dialog and omits duplicate package guidance", async () => {
    const user = userEvent.setup();
    const { onOpenChange, onZipSubmit } = renderDialog();

    await user.click(
      screen.getByRole("tab", { name: "settings:SETTINGS_WORKSPACE_SKILLS_UPLOAD_ZIP" }),
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File([new Uint8Array(1.5 * 1024 * 1024)], "editorial.zip", {
      type: "application/zip",
    });
    await user.upload(input!, file);

    expect(screen.getByText("1.5 MiB")).toBeInTheDocument();
    expect(
      screen.queryByText("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_REQUIREMENTS", { selector: "p" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "settings:SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORT_ACTION" }),
    );

    expect(onZipSubmit).toHaveBeenCalledWith(file);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("rejects non-repository URLs and non-ZIP files before invoking either API", async () => {
    const { onGitHubSubmit, onZipSubmit } = renderDialog();
    fireEvent.change(
      screen.getByLabelText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_LABEL"),
      { target: { value: "https://github.com/acme/site-skill/tree/main" } },
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_IMPORT_ACTION",
      }),
    );
    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_SKILLS_GITHUB_REPOSITORY_ERROR"),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("tab", { name: "settings:SETTINGS_WORKSPACE_SKILLS_UPLOAD_ZIP" }),
    );
    fireEvent.change(document.querySelector<HTMLInputElement>('input[type="file"]')!, {
      target: { files: [new File(["content"], "editorial.txt", { type: "text/plain" })] },
    });

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMAT_ERROR"),
    ).toBeInTheDocument();
    expect(onGitHubSubmit).not.toHaveBeenCalled();
    expect(onZipSubmit).not.toHaveBeenCalled();
  });
});

describe("GitHub Skill import model", () => {
  it("accepts only a public repository root", () => {
    expect(
      githubSkillImportSchema.safeParse({
        repositoryUrl: "https://github.com/acme/brand_voice.git",
      }).success,
    ).toBe(true);
    expect(
      githubSkillImportSchema.safeParse({
        repositoryUrl: "https://user:token@github.com/acme/skill",
      }).success,
    ).toBe(false);
  });
});
