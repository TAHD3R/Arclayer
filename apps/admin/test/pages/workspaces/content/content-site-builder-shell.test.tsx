import type { PropsWithChildren, ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ContentSiteBuilderPage } from "@/pages/projects/content/site-builder/page";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

const getMyProjectAuthzMock = vi.fn();
const listProjectPermissionActionsMock = vi.fn();

vi.mock("@/api/workspaces", () => ({
  getMyProjectAuthz: (...args: unknown[]) => getMyProjectAuthzMock(...args),
}));

vi.mock("@/api/rbac", () => ({
  listProjectPermissionActions: (...args: unknown[]) => listProjectPermissionActionsMock(...args),
}));

function renderWithQuery(node: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("ContentSiteBuilderPage", () => {
  test("shows read-only builder guidance when content management access is missing", async () => {
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      isSuperuser: false,
      permissionCodes: ["system:content:read"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:content:site-builder:write",
        description: "Allow configuring canvas and site builder workflows.",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:content:manage"],
      },
    ]);

    renderWithQuery(
      <ContentSiteBuilderPage
        projectId="project-1"
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
          capabilityPackIds: ["publishable", "visual_editable"],
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

    expect(await screen.findByTestId("content-site-builder-no-access")).toBeInTheDocument();
    expect(screen.getByTestId("content-site-builder-open-item")).toBeDisabled();
  });

  test("renders a real site builder shell even without an active canvas item", () => {
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      isSuperuser: false,
      permissionCodes: ["system:content:manage", "system:content:read"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:content:site-builder:write",
        description: "Allow configuring canvas and site builder workflows.",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:content:manage"],
      },
    ]);

    renderWithQuery(<ContentSiteBuilderPage projectId="project-1" />);

    expect(screen.getByTestId("content-site-builder-shell")).toBeInTheDocument();
    expect(screen.getByTestId("content-site-builder-empty-state")).toBeInTheDocument();
  });

  test("renders in-surface boundary UI when canvas capabilities are incomplete", () => {
    getMyProjectAuthzMock.mockResolvedValue({
      projectId: "project-1",
      isSuperuser: false,
      permissionCodes: ["system:content:manage", "system:content:read"],
    });
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:content:site-builder:write",
        description: "Allow configuring canvas and site builder workflows.",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:content:manage"],
      },
    ]);

    renderWithQuery(
      <ContentSiteBuilderPage
        projectId="project-1"
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

  test("keeps builder actions closed while permissions warm up", async () => {
    getMyProjectAuthzMock.mockImplementationOnce(() => new Promise(() => {}));
    listProjectPermissionActionsMock.mockResolvedValue([
      {
        code: "project:content:site-builder:write",
        description: "Allow configuring canvas and site builder workflows.",
        subjectKinds: ["project_member"],
        permissionCodes: ["system:content:manage"],
      },
    ]);

    renderWithQuery(
      <ContentSiteBuilderPage
        projectId="project-1"
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
          capabilityPackIds: ["publishable", "visual_editable"],
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

    await waitFor(() => {
      expect(screen.getByTestId("content-site-builder-open-item")).toBeDisabled();
    });
    expect(screen.queryByTestId("content-site-builder-no-access")).not.toBeInTheDocument();
  });
});
