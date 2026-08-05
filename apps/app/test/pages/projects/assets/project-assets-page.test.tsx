import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AssetsPage } from "@/pages/workspaces/assets/page";

vi.mock("@/pages/workspaces/assets/components/assets-page-view", () => ({
  AssetsPageView: (props: {
    initialAssetId?: string;
    initialSearchQuery?: string;
    projectId: string;
  }) => (
    <div
      data-testid="project-assets-page-view"
      data-asset-id={props.initialAssetId ?? ""}
      data-project-id={props.projectId}
      data-search-query={props.initialSearchQuery ?? ""}
    />
  ),
}));

describe("project assets page", () => {
  it("threads the route project id into the assets surface", () => {
    render(<AssetsPage projectId="project-1" initialAssetId="asset-1" initialSearchQuery="hero" />);

    expect(screen.getByTestId("project-assets-page-view")).toHaveAttribute(
      "data-project-id",
      "project-1",
    );
    expect(screen.getByTestId("project-assets-page-view")).toHaveAttribute(
      "data-asset-id",
      "asset-1",
    );
    expect(screen.getByTestId("project-assets-page-view")).toHaveAttribute(
      "data-search-query",
      "hero",
    );
  });
});
