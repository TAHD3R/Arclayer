import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@arclayer/ui/tooltip";

import { WorkspaceSkillZipImportDialog } from "@/pages/workspaces/settings/workspace/skills/workspace-skill-zip-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("WorkspaceSkillZipImportDialog", () => {
  it("submits a validated ZIP and presents MiB sizes accurately", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <TooltipProvider>
        <WorkspaceSkillZipImportDialog
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
          open
          pending={false}
        />
      </TooltipProvider>,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File([new Uint8Array(1.5 * 1024 * 1024)], "editorial.zip", {
      type: "application/zip",
    });

    await user.upload(input!, file);
    expect(screen.getByText("1.5 MiB")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "settings:SETTINGS_WORKSPACE_SKILLS_ZIP_IMPORT_ACTION",
      }),
    );

    expect(onSubmit).toHaveBeenCalledWith(file);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejects non-ZIP files before invoking the API", async () => {
    const onSubmit = vi.fn();
    render(
      <TooltipProvider>
        <WorkspaceSkillZipImportDialog
          onOpenChange={vi.fn()}
          onSubmit={onSubmit}
          open
          pending={false}
        />
      </TooltipProvider>,
    );
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');

    fireEvent.change(input!, {
      target: { files: [new File(["content"], "editorial.txt", { type: "text/plain" })] },
    });

    expect(
      await screen.findByText("settings:SETTINGS_WORKSPACE_SKILLS_ZIP_FORMAT_ERROR"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
