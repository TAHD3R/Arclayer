import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ContentBootstrapPage } from "@/pages/workspaces/content/bootstrap/page";

const mocked = vi.hoisted(() => ({
  useContentBootstrapController: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/pages/workspaces/content/bootstrap/hooks/use-content-bootstrap-controller", () => ({
  useContentBootstrapController: mocked.useContentBootstrapController,
}));

describe("ContentBootstrapPage", () => {
  test("renders step one while draft creation has not happened", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      locale: "en-US",
      localeOptions: [{ value: "en-US", label: "English" }],
      title: "",
      draftItem: null,
      shapeSelection: { presetKey: null, presetState: "none", capabilityPackIds: [] },
      draftCreated: false,
      busy: false,
      createDraftPending: false,
      continuePending: false,
      canCreateDraft: false,
      hasPresetSelection: false,
      setTitle: vi.fn(),
      setLocale: vi.fn(),
      createDraft: vi.fn(),
      continueToEditor: vi.fn(),
      detachPreset: vi.fn(),
      navigateToLibrary: vi.fn(),
      selectPreset: vi.fn(),
      toggleCapabilityPack: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getAllByText("CONTENT_BOOTSTRAP_STEP_ONE_TITLE").length).toBeGreaterThan(0);
    expect(screen.getByText("CONTENT_BOOTSTRAP_ACTION_CREATE_DRAFT")).toBeInTheDocument();
    expect(screen.queryByText("my-draft")).not.toBeInTheDocument();
  });

  test("renders step two summary and shaping controls after draft creation", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      locale: "en-US",
      localeOptions: [{ value: "en-US", label: "English" }],
      title: "My draft",
      draftItem: {
        id: "item-1",
        workspaceId: "ws-1",
        siteId: "site-1",
        slug: "my-draft",
        title: "My draft",
        status: "draft",
        visibility: "private",
        locale: "en-US",
        bootstrapPresetState: "selected",
        capabilityPackIds: ["publishable"],
        draftVersion: 1,
        updatedAt: "2026-03-19T00:00:00Z",
      },
      shapeSelection: {
        presetKey: "post",
        presetState: "selected",
        capabilityPackIds: ["publishable", "taxonomy_enabled", "seo_managed", "schedulable"],
      },
      draftCreated: true,
      busy: false,
      createDraftPending: false,
      continuePending: false,
      canCreateDraft: true,
      hasPresetSelection: true,
      setTitle: vi.fn(),
      setLocale: vi.fn(),
      createDraft: vi.fn(),
      continueToEditor: vi.fn(),
      detachPreset: vi.fn(),
      navigateToLibrary: vi.fn(),
      selectPreset: vi.fn(),
      toggleCapabilityPack: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("My draft")).toBeInTheDocument();
    expect(screen.getByText("my-draft")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_STEP_TWO_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_ACTION_CONTINUE_TO_EDITOR")).toBeInTheDocument();
  });
});
