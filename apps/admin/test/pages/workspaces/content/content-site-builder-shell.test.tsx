import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ContentSiteBuilderPage } from "@/pages/workspaces/content/site-builder/page";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

describe("ContentSiteBuilderPage", () => {
  test("renders a real site builder shell even without an active canvas item", () => {
    render(<ContentSiteBuilderPage workspaceId="ws-1" />);

    expect(screen.getByTestId("content-site-builder-shell")).toBeInTheDocument();
    expect(screen.getByTestId("content-site-builder-empty-state")).toBeInTheDocument();
  });

  test("renders in-surface boundary UI when canvas capabilities are incomplete", () => {
    render(
      <ContentSiteBuilderPage
        workspaceId="ws-1"
        item={{
          id: "item-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-1",
          modelKey: "page",
          slug: "landing-page",
          title: "Landing page",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["publishable"],
          resolvedRole: "page",
          resolvedPosture: "page",
          resolvedSurface: "canvas",
          derivedStatus: "draft",
          runtime: "visual",
          context: "site_builder",
          libraryGroup: "site-content",
          editWith: "canvas",
          role: "page",
          shapeState: "ready",
          draftVersion: 1,
          updatedAt: "2026-04-04T00:00:00Z",
        }}
      />,
    );

    expect(screen.getByTestId("content-site-builder-shell")).toBeInTheDocument();
    expect(screen.getByTestId("content-site-builder-boundary")).toBeInTheDocument();
  });
});
