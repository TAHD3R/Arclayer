import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceInlineNameEditor } from "@/pages/usercenter/workspaces/components/workspace-inline-name-editor";

describe("WorkspaceInlineNameEditor", () => {
  it("renders the word count inside the input suffix slot when requested", () => {
    const { container } = render(
      <WorkspaceInlineNameEditor
        editing
        value="Alpha"
        draftValue="Alpha"
        ariaLabel="Workspace name"
        maxLength={128}
        counterPlacement="suffix"
        onDraftChange={() => undefined}
        onCommit={() => undefined}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText("5/128")).toBeInTheDocument();
    expect(container.querySelector(".relative")).toBeTruthy();
    expect(container.querySelector("input")).toHaveClass("pr-14");
  });
});
