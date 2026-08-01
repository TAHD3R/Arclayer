import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectGeneralSettingsPage } from "@/pages/settings/context-settings-pages";

vi.mock("@/pages/projects/settings/project/page", () => ({
  ProjectSettingsPage: (props: { activeTab: string; projectId: string }) => (
    <div
      data-testid="project-settings-page"
      data-active-tab={props.activeTab}
      data-project-id={props.projectId}
    />
  ),
}));

describe("context settings pages", () => {
  it("renders project general settings through the project settings shell", () => {
    render(<ProjectGeneralSettingsPage projectId="project-1" />);

    expect(screen.getByTestId("project-settings-page")).toHaveAttribute(
      "data-active-tab",
      "general",
    );
    expect(screen.getByTestId("project-settings-page")).toHaveAttribute(
      "data-project-id",
      "project-1",
    );
  });
});
