import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ContentStructuredSurfacePage } from "@/pages/projects/content/structured/page";

const getContentItemVersionMock = vi.fn();
const saveContentItemDraftVersionMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifySuccessTextMock = vi.fn();

vi.mock("@/api/content", () => ({
  getContentItemVersion: (...args: unknown[]) => getContentItemVersionMock(...args),
  saveContentItemDraftVersion: (...args: unknown[]) => saveContentItemDraftVersionMock(...args),
}));

vi.mock("@/lib/notifications", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccessText: (...args: unknown[]) => notifySuccessTextMock(...args),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.version ? `${key}:${String(options.version)}` : key,
  }),
}));

vi.mock("@/layouts/page-shell/default-page", () => ({
  DefaultPage: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("ContentStructuredSurfacePage", () => {
  beforeEach(() => {
    getContentItemVersionMock.mockReset();
    saveContentItemDraftVersionMock.mockReset();
    notifyErrorMock.mockReset();
    notifySuccessTextMock.mockReset();
    getContentItemVersionMock.mockResolvedValue({
      itemId: "item-1",
      versionNumber: 1,
      state: "draft",
      fieldsSnapshot: {
        title: "FAQ entry",
        answer: "Structured answer",
        propsDefaults: { align: "center" },
      },
      presentations: [],
      createdAt: "2026-04-04T00:00:00Z",
      changeSummary: null,
    });
    saveContentItemDraftVersionMock.mockResolvedValue({
      itemId: "item-1",
      versionNumber: 2,
      state: "draft",
      fieldsSnapshot: {
        title: "Updated FAQ",
        propsDefaults: { align: "left" },
      },
      presentations: [],
      createdAt: "2026-04-04T00:00:00Z",
      changeSummary: "CONTENT_STRUCTURED_SURFACE_FIELDS_CHANGE_SUMMARY",
    });
  });

  test("renders the structured continuation surface with item context", async () => {
    render(
      <ContentStructuredSurfacePage
        projectId="project-1"
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
      { wrapper: createWrapper() },
    );

    expect(screen.getByTestId("content-structured-surface")).toBeInTheDocument();
    expect(screen.getByText("FAQ entry")).toBeInTheDocument();
    expect(await screen.findByTestId("content-structured-surface-fields")).toBeInTheDocument();
    expect(screen.getByText("answer")).toBeInTheDocument();
    expect(screen.getByText("Structured answer")).toBeInTheDocument();
    expect(screen.getByText("propsDefaults")).toBeInTheDocument();
    expect(screen.getAllByText(/"align": "center"/).length).toBeGreaterThan(0);
    expect(screen.getByText("CONTENT_STRUCTURED_SURFACE_NEXT_TITLE")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CONTENT_ITEM_CONTINUATION_ACTION_BACK_TO_LIBRARY" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_STRUCTURED_SURFACE_SCHEMA_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByText("CONTENT_STRUCTURED_SURFACE_WORKFLOW_TITLE")).not.toBeInTheDocument();
    expect(screen.queryByTestId("content-structured-surface-boundary")).not.toBeInTheDocument();
  });

  test("saves edited field JSON as a real draft version", async () => {
    const user = userEvent.setup();

    render(
      <ContentStructuredSurfacePage
        projectId="project-1"
        item={{
          id: "item-1",
          workspaceId: "ws-1",
          siteId: "site-1",
          modelId: "model-1",
          modelKey: "reusable-section",
          slug: "hero",
          title: "Hero",
          status: "draft",
          visibility: "private",
          locale: "en-US",
          bootstrapPresetState: "selected",
          capabilityPackIds: ["queryable", "visual_editable", "has_slots"],
          resolvedRole: "reusable-section",
          resolvedPosture: "composition",
          resolvedSurface: "canvas",
          derivedStatus: "draft",
          runtime: "visual",
          context: "site_builder",
          libraryGroup: "site-content",
          editWith: "canvas",
          role: "reusable-section",
          shapeState: "ready",
          draftVersion: 1,
          updatedAt: "2026-04-04T00:00:00Z",
        }}
      />,
      { wrapper: createWrapper() },
    );

    await screen.findByTestId("content-structured-surface-fields");
    const input = screen.getByLabelText("CONTENT_STRUCTURED_SURFACE_FIELDS_JSON_LABEL");
    await user.clear(input);
    await user.click(input);
    await user.paste('{"title":"Updated FAQ","propsDefaults":{"align":"left"}}');
    await user.click(
      screen.getByRole("button", { name: "CONTENT_STRUCTURED_SURFACE_FIELDS_SAVE" }),
    );

    await waitFor(() => {
      expect(saveContentItemDraftVersionMock).toHaveBeenCalledWith("project-1", "item-1", {
        expectedVersion: 1,
        changeSummary: "CONTENT_STRUCTURED_SURFACE_FIELDS_CHANGE_SUMMARY",
        fieldsSnapshot: {
          title: "Updated FAQ",
          propsDefaults: { align: "left" },
        },
        presentations: [
          {
            kind: "form_data",
            payload: {
              title: "Updated FAQ",
              propsDefaults: { align: "left" },
            },
          },
        ],
      });
    });
    expect(notifySuccessTextMock).toHaveBeenCalledWith(
      "CONTENT_STRUCTURED_SURFACE_FIELDS_SAVE_SUCCESS",
    );
  });

  test("does not save invalid field JSON", async () => {
    const user = userEvent.setup();

    render(
      <ContentStructuredSurfacePage
        projectId="project-1"
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
          capabilityPackIds: ["queryable"],
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
      { wrapper: createWrapper() },
    );

    await screen.findByTestId("content-structured-surface-fields");
    const input = screen.getByLabelText("CONTENT_STRUCTURED_SURFACE_FIELDS_JSON_LABEL");
    await user.clear(input);
    await user.type(input, "not json");
    await user.click(
      screen.getByRole("button", { name: "CONTENT_STRUCTURED_SURFACE_FIELDS_SAVE" }),
    );

    expect(
      await screen.findByTestId("content-structured-surface-fields-validation"),
    ).toHaveTextContent("CONTENT_STRUCTURED_SURFACE_FIELDS_INVALID_JSON");
    expect(saveContentItemDraftVersionMock).not.toHaveBeenCalled();
  });

  test("renders an in-surface boundary when structured capabilities are incomplete", () => {
    render(
      <ContentStructuredSurfacePage
        projectId="project-1"
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
      { wrapper: createWrapper() },
    );

    expect(screen.getByTestId("content-structured-surface")).toBeInTheDocument();
    expect(screen.getByTestId("content-structured-surface-boundary")).toBeInTheDocument();
  });
});
