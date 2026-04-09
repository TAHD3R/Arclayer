import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ContentStructuredSurfacePage } from "@/pages/workspaces/content/structured/page";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

describe("ContentStructuredSurfacePage", () => {
  test("renders the structured continuation surface with item context", () => {
    render(
      <ContentStructuredSurfacePage
        workspaceId="ws-1"
        item={{
          id: "item-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-1",
          modelKey: "faq-entry",
          slug: "faq-entry",
          title: "FAQ entry",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["queryable", "has_relations"],
          resolvedRole: "data",
          resolvedPosture: "structured",
          resolvedSurface: "structured",
          derivedStatus: "draft",
          runtime: "data",
          context: "content_library",
          libraryGroup: "structured-content",
          editWith: "structured",
          role: "data",
          shapeState: "ready",
          draftVersion: 1,
          updatedAt: "2026-04-04T00:00:00Z",
        }}
      />,
    );

    expect(screen.getByTestId("content-structured-surface")).toBeInTheDocument();
    expect(screen.getByText("FAQ entry")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_STRUCTURED_SURFACE_NEXT_TITLE")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CONTENT_ITEM_CONTINUATION_ACTION_BACK_TO_LIBRARY" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_STRUCTURED_SURFACE_SCHEMA_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_STRUCTURED_SURFACE_WORKFLOW_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("content-structured-surface-boundary")).not.toBeInTheDocument();
  });

  test("renders an in-surface boundary when structured capabilities are incomplete", () => {
    render(
      <ContentStructuredSurfacePage
        workspaceId="ws-1"
        item={{
          id: "item-2",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-1",
          modelKey: "faq-entry",
          slug: "faq-entry",
          title: "FAQ entry",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["publishable"],
          resolvedRole: "data",
          resolvedPosture: "structured",
          resolvedSurface: "structured",
          derivedStatus: "draft",
          runtime: "data",
          context: "content_library",
          libraryGroup: "structured-content",
          editWith: "structured",
          role: "data",
          shapeState: "ready",
          draftVersion: 1,
          updatedAt: "2026-04-04T00:00:00Z",
        }}
      />,
    );

    expect(screen.getByTestId("content-structured-surface")).toBeInTheDocument();
    expect(screen.getByTestId("content-structured-surface-boundary")).toBeInTheDocument();
  });
});
