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
  test("renders a single-step create form with start-from options", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      availableModels: [
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          description: "Long-form posts",
          category: "content_library",
          capabilities: ["publishable", "rich_text_editable"],
          defaultRole: "article",
          defaultPosture: "entry",
          defaultSurface: "writing",
        },
      ],
      hasAvailableModels: true,
      modelsLoading: false,
      modelsError: null,
      title: "",
      selectedModelKey: null,
      selectedPresetKey: null,
      busy: false,
      continuePending: false,
      canContinue: false,
      setTitle: vi.fn(),
      selectModel: vi.fn(),
      continueWithStarter: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToModels: vi.fn(),
      selectPreset: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_CREATE_TITLE")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_MODEL_LABEL")).toBeInTheDocument();
    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_TITLE_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_START_WITH_LABEL")).toBeInTheDocument();
    expect(screen.getByText("CONTENT_BOOTSTRAP_PRESET_PAGE_NAME")).toBeInTheDocument();
    expect(screen.queryByText("CONTENT_BOOTSTRAP_PRESET_BLANK_NAME")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_SKIP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CONTINUE" }),
    ).toBeDisabled();
    expect(screen.getByText("CONTENT_BOOTSTRAP_START_FROM_DESC")).toBeInTheDocument();
    expect(
      screen.queryByText("CONTENT_BOOTSTRAP_ACTION_CONTINUE_TO_EDITOR"),
    ).not.toBeInTheDocument();
  });

  test("reflects the selected start-from template", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      availableModels: [
        {
          id: "model-article",
          workspaceId: "ws-1",
          siteId: "site-1",
          key: "article",
          name: "Article",
          description: "Long-form posts",
          category: "content_library",
          capabilities: ["publishable", "rich_text_editable"],
          defaultRole: "article",
          defaultPosture: "entry",
          defaultSurface: "writing",
        },
      ],
      hasAvailableModels: true,
      modelsLoading: false,
      modelsError: null,
      title: "My draft",
      selectedModelKey: "article",
      selectedPresetKey: "post",
      busy: false,
      continuePending: false,
      canContinue: true,
      setTitle: vi.fn(),
      selectModel: vi.fn(),
      continueWithStarter: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToModels: vi.fn(),
      selectPreset: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_CREATE_TITLE")).toBeInTheDocument();
    expect(screen.getByDisplayValue("My draft")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Article/i })).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("radio", { name: /CONTENT_BOOTSTRAP_PRESET_POST_NAME/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_SKIP" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CONTINUE" })).toBeEnabled();
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent ===
          [
            "CONTENT_BOOTSTRAP_START_FROM_DESC",
            "CONTENT_BOOTSTRAP_START_CURRENT_TEMPLATE_PREFIX",
            "CONTENT_BOOTSTRAP_PRESET_POST_NAME",
          ].join(""),
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("CONTENT_BOOTSTRAP_PRESET_POST_NAME")).toHaveLength(2);
  });

  test("shows a setup action instead of continue when no content models exist", () => {
    mocked.useContentBootstrapController.mockReturnValue({
      availableModels: [],
      hasAvailableModels: false,
      modelsLoading: false,
      modelsError: null,
      title: "",
      selectedModelKey: null,
      selectedPresetKey: null,
      busy: false,
      continuePending: false,
      canContinue: false,
      setTitle: vi.fn(),
      selectModel: vi.fn(),
      continueWithStarter: vi.fn(),
      navigateToLibrary: vi.fn(),
      navigateToModels: vi.fn(),
      selectPreset: vi.fn(),
    });

    render(<ContentBootstrapPage workspaceId="ws-1" />);

    expect(screen.getByText("CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "CONTENT_BOOTSTRAP_FIELD_MODEL_EMPTY_ACTION" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "CONTENT_BOOTSTRAP_ACTION_CONTINUE" }),
    ).not.toBeInTheDocument();
  });
});
