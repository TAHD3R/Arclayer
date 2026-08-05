import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ProjectDomainsPage } from "@/pages/projects/project-releases/page";

vi.mock("@/pages/projects/settings/domain/page", () => ({
  ProjectDomainSettingsPage: (props: { projectId: string; attachment?: React.ReactNode }) => (
    <main data-testid="project-domains-page" data-project-id={props.projectId}>
      <div data-testid="project-domain-list" />
      <section data-testid="project-domain-release-attachment">{props.attachment}</section>
    </main>
  ),
}));

vi.mock("@/pages/projects/releases/page", () => ({
  ProjectReleasesPage: (props: { projectId: string; embedded?: boolean }) => (
    <div
      data-testid="project-domain-release-content"
      data-project-id={props.projectId}
      data-embedded={String(props.embedded)}
    />
  ),
}));

describe("ProjectDomainsPage", () => {
  it("owns the page through the domain surface and attaches publishing to it", () => {
    render(<ProjectDomainsPage projectId="project-1" />);

    expect(screen.getByTestId("project-domains-page")).toHaveAttribute(
      "data-project-id",
      "project-1",
    );
    expect(screen.getByTestId("project-domain-release-attachment")).toContainElement(
      screen.getByTestId("project-domain-release-content"),
    );
    expect(screen.getByTestId("project-domain-release-content")).toHaveAttribute(
      "data-project-id",
      "project-1",
    );
    expect(screen.getByTestId("project-domain-release-content")).toHaveAttribute(
      "data-embedded",
      "true",
    );
  });
});
